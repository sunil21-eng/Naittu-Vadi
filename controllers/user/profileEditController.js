const User = require('../../models/userSchema');
const Address = require('../../models/addressSchema');
const bcrypt = require('bcrypt');
const nodemailer = require('nodemailer');
const cloudinary = require('cloudinary').v2;
const mongoose = require('mongoose');

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// Helper: upload buffer to Cloudinary
function uploadToCloudinary(buffer, folder) {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder },
      (error, result) => {
        if (error) reject(error);
        else resolve(result);
      }
    );
    stream.end(buffer);
  });
}

const userProfile = async function (req, res) {
  try {
    const userId = req.session.user?._id || req.session.user;
    const user = await User.findById(userId);
    if (!user) return res.render('user/login');
    return res.render('user/userProfile', { user });
  } catch (error) {
    console.log("load userProfile:", error);
    res.status(500).send("Error loading profile");
  }
};

const editProfile = async function (req, res) {
  try {
    const userId = req.session.user?._id || req.session.user;
    const user = await User.findById(userId);
    if (!user) return res.render('user/login');
    return res.render('user/editProfile', { user });
  } catch (error) {
    console.log("load editProfile error:", error);
    return res.status(500).send("Error loading edit profile");
  }
};

const updateProfile = async function (req, res) {
  try {
    const { firstName, lastName, email, phone, dob } = req.body;

    if (!firstName || !/^[a-zA-Z]+$/.test(firstName)) {
      return res.status(400).json({ error: 'Invalid first name' });
    }
    if (!lastName || !/^[a-zA-Z]+$/.test(lastName)) {
      return res.status(400).json({ error: 'Invalid last name' });
    }
    if (phone && !/^[6-9]\d{9}$/.test(phone)) {
      return res.status(400).json({ error: 'Invalid phone number' });
    }
    if (dob) {
      const dobDate = new Date(dob);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      if (dobDate >= today) {
        return res.status(400).json({ error: 'DOB must be in the past' });
      }
    }

    const userId = req.session.user?._id || req.session.user;
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // ---------- EMAIL CHANGE – require OTP ----------
    if (email && email !== user.email) {
      const otp = generateOtp();
      req.session.profileOtp = otp;
      req.session.profileOtpExpiry = Date.now() + 10 * 60 * 1000; // 10 minutes

      // Upload new image to Cloudinary (if a file was sent)
      let cloudinaryPublicId = null;
      if (req.file) {
        try {
          const result = await uploadToCloudinary(req.file.buffer, 'profileImages');
          cloudinaryPublicId = result.public_id;
        } catch (err) {
          console.error('Cloudinary upload error:', err);
          return res.status(500).json({ error: 'Image upload failed' });
        }
      }

      req.session.pendingProfileData = {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        email: email.trim(),
        phone: phone ? phone.trim() : null,
        dob: dob || null,
        profileImage: cloudinaryPublicId ? [cloudinaryPublicId] : []
      };

      const emailSent = await sendEmailVerification(email, otp);
      if (!emailSent) {
        return res.status(500).json({ error: 'Failed to send OTP email' });
      }

      return res.json({
        success: true,
        requiresOtp: true,
        message: 'OTP sent to your new email address for verification'
      });
    }

    // ---------- NO EMAIL CHANGE – update immediately ----------
    user.firstName = firstName.trim();
    user.lastName = lastName.trim();
    user.phone = phone ? phone.trim() : null;
    user.dob = dob || null;

    if (req.file) {
      // Delete old Cloudinary image if exists
      if (user.profileImage && user.profileImage.length > 0) {
        const oldPublicId = user.profileImage[0];
        if (oldPublicId && !oldPublicId.startsWith('/')) {
          await cloudinary.uploader.destroy(oldPublicId).catch(err =>
            console.log('Error deleting old profile image:', err)
          );
        }
      }
      // Upload new image
      const result = await uploadToCloudinary(req.file.buffer, 'profileImages');
      user.profileImage = [result.public_id];
    }

    await user.save();

    res.json({
      success: true,
      message: 'Profile updated successfully',
      requiresOtp: false
    });
  } catch (error) {
    console.log("updateProfile error:", error);
    return res.status(500).send({ error: 'Server error' });
  }
};

const deleteProfileImage = async function (req, res) {
  try {
    const user = await User.findById(req.session.user);
    if (!user) return res.status(404).json({ error: 'User not found' });

    if (user.profileImage && user.profileImage.length > 0) {
      const imageId = user.profileImage[0];
      // Delete from Cloudinary (ignore old local paths starting with '/')
      if (imageId && !imageId.startsWith('/')) {
        await cloudinary.uploader.destroy(imageId).catch(err =>
          console.log('Error deleting Cloudinary image:', err)
        );
      }
      user.profileImage = [];
      await user.save();
      return res.json({ success: true, message: "Profile image deleted successfully" });
    } else {
      return res.json({ success: true, message: "No profile image to delete" });
    }
  } catch (error) {
    console.log('Error deleting profile image:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

const verifyProfileOtp = async (req, res) => {
  try {
    const { otp } = req.body;

    if (!req.session.profileOtp || !req.session.profileOtpExpiry) {
      return res.status(400).json({ error: "No OTP requested" });
    }
    if (Date.now() > req.session.profileOtpExpiry) {
      return res.status(400).json({ error: "OTP expired" });
    }
    if (otp !== req.session.profileOtp) {
      return res.status(400).json({ error: "Invalid OTP" });
    }

    const userId = req.session.user?._id || req.session.user;
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ error: "User not found" });

    const pending = req.session.pendingProfileData;

    // If a new profile image is being set, delete the old one from Cloudinary
    if (pending.profileImage && pending.profileImage.length > 0 && user.profileImage && user.profileImage.length > 0) {
      const oldPublicId = user.profileImage[0];
      if (oldPublicId && !oldPublicId.startsWith('/')) {
        await cloudinary.uploader.destroy(oldPublicId).catch(err =>
          console.log('Error deleting old profile image:', err)
        );
      }
    }

    // Apply all pending updates
    Object.assign(user, pending);
    await user.save();

    // Clear session
    req.session.profileOtp = null;
    req.session.profileOtpExpiry = null;
    req.session.pendingProfileData = null;

    return res.json({ success: true, message: "Email verified & profile updated" });
  } catch (error) {
    console.error("verifyProfileOtp error:", error);
    return res.status(500).json({ error: "Server error" });
  }
};

const resendProfileOtp = async (req, res) => {
  try {
    if (!req.session.pendingProfileData) {
      return res.status(400).json({ error: "No pending profile update" });
    }
    const otp = generateOtp();
    req.session.profileOtp = otp;
    req.session.profileOtpExpiry = Date.now() + 10 * 60 * 1000;
    const emailSent = await sendEmailVerification(req.session.pendingProfileData.email, otp);
    if (!emailSent) {
      return res.status(500).json({ error: 'Failed to resend OTP email' });
    }
    return res.json({ success: true, message: 'New OTP sent to your email address' });
  } catch (error) {
    console.error("resendProfileOtp error:", error);
    return res.status(500).json({ error: "Server error" });
  }
};

function generateOtp() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

async function sendEmailVerification(toEmail, otp) {
  try {
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      secure: false,
      port: 587,
      requireTLS: false,
      auth: {
        user: process.env.NODEMAILER_EMAIL,
        pass: process.env.NODEMAILER_PASSWORD
      }
    });
    const mailOptions = {
      from: process.env.NODEMAILER_EMAIL,
      to: toEmail,
      subject: "Profile Update OTP Verification",
      text: `Your OTP is :${otp}`,
      html: `<b> Your OTP is :${otp} </b>`
    };
    await transporter.sendMail(mailOptions);
    return true;
  } catch (err) {
    console.error("sendEmailVerification error:", err);
    return false;
  }
}

// ---------- PASSWORD & ADDRESS FUNCTIONS (unchanged) ----------
const changePassword = async function (req, res) {
  try {
    if (!req.session.user) return res.redirect("/user/login");
    const user = await User.findById(req.session.user);
    if (!user) return res.redirect("/user/login");
    res.render("user/changepassword", {
      user,
      title: "Change Password - AllScouts",
      messages: {
        success: req.flash("success"),
        error: req.flash("error")
      }
    });
  } catch (error) {
    console.log("changePassword:", error);
    res.redirect("/profile");
  }
};

const updatePassword = async (req, res, next) => {
  try {
    const { currentPassword, newPassword, confirmPassword } = req.body;

    if (!req.session.user) {
      return res.status(401).json({ success: false, message: "Please Login in to continue" });
    }
    if (!currentPassword || !newPassword || !confirmPassword) {
      return res.status(400).json({ success: false, message: "All fields are required" });
    }
    const passwordRegex = /^(?=.*[A-Z])(?=.*\d).{8,}$/;
    if (!passwordRegex.test(newPassword)) {
      return res.status(401).json({ success: false, message: "New password must be at least 8 characters with 1 uppercase letter and 1 number" });
    }
    if (newPassword !== confirmPassword) {
      return res.status(400).json({ success: false, message: "NewPassword and ConfirmPassword Doesnt match" });
    }

    const user = await User.findById(req.session.user);
    if (!user) return res.status(400).json({ success: false, message: "User not found" });
    if (!user.password) return res.status(400).json({ success: false, message: "Cannot change passwords for Social login accounts" });

    const isCurrentPasswordValid = await bcrypt.compare(currentPassword, user.password);
    if (!isCurrentPasswordValid) return res.status(400).json({ success: false, message: "Current Password is incorrect" });

    const isSamePassword = await bcrypt.compare(newPassword, user.password);
    if (isSamePassword) return res.status(400).json({ success: false, message: "NewPassword must be different from the  Current Password" });

    const saltRounds = 10;
    const hashedNewPassword = await bcrypt.hash(newPassword, saltRounds);
    await User.findByIdAndUpdate(req.session.user, { password: hashedNewPassword }, { new: true });
    return res.json({ success: true, message: "Succesfully Updated Password" });
  } catch (error) {
    next(error);
  }
};

// All address functions remain exactly as they were (only minor formatting changes)
const getAddresses = async function (req, res) {
  try {
    const userId = req.session.user?._id || req.session.user;
    if (!userId) return res.render('user/login');
    const user = await User.findById(userId);
    if (!user) return res.render('user/login');
    const addressDoc = await Address.findOne({ userId: userId });
    const addresses = addressDoc?.address || [];
    const messages = { success: req.query.success || null, error: req.query.error || null };
    res.render('user/address', { user, addresses, title: 'Addresses - AllScouts', messages });
  } catch (error) {
    console.log("loadgetAddresses error:", error);
    res.redirect('user/profile');
  }
};

const addAddress = async function (req, res, next) {
  try {
    const userId = req.session.user?._id || req.session.user;
    if (!userId) return res.render('user/login');
    const user = await User.findById(userId);
    if (!user) return res.render('user/login');
    return res.render('user/addAddress', { user, title: "Add Address - Allscouts", messages: {} });
  } catch (error) {
    next(error);
  }
};

function validateAddress(data) {
  const { name, email, number, houseName, street, city, state, country, pincode, saveAs } = data;
  if (!name || !email || !number || !houseName || !street || !city || !state || !country || !pincode || !saveAs) {
    return { success: false, message: "All required fields must be filled" };
  }
  if (!/^[a-zA-Z\s]{2,50}$/.test(name.trim())) return { success: false, message: "Name should contain only letters and spaces (2-50 characters)" };
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email.trim())) return { success: false, message: "Please enter a valid email address" };
  const phoneStr = number.toString();
  if (!/^[6-9]\d{9}$/.test(phoneStr)) return { success: false, message: "Phone number should be 10 digits starting with 6-9" };
  if (!/^\d{6}$/.test(pincode)) return { success: false, message: "Pincode should be exactly 6 digits" };
  const textFields = [{ field: houseName, name: "House name" }, { field: street, name: "Street address" }, { field: city, name: "City" }, { field: state, name: "State" }];
  for (let textField of textFields) {
    if (!textField.field.trim() || textField.field.trim().length < 2 || textField.field.trim().length > 100) {
      return { success: false, message: `${textField.name} should be between 2-100 characters` };
    }
  }
  if (!["Home", "Work", "Other"].includes(saveAs)) return { success: false, message: "Invalid address type selected" };
  return { success: true };
}

const addNewAddress = async function (req, res) {
  try {
    const validation = validateAddress(req.body);
    if (!validation.success) return res.status(400).json(validation);
    const { name, email, number, houseName, street, city, state, country, pincode, saveAs, courierBranch, isDefault } = req.body;
    if (!req.session.user) return res.status(401).json({ success: false, message: "Please login to continue" });

    let userAddressDoc = await Address.findOne({ userId: req.session.user });
    if (!userAddressDoc) {
      userAddressDoc = new Address({
        userId: req.session.user,
        address: [{
          name: name.trim(), email: email.trim(), number: number.toString(),
          houseName: houseName.trim(), street: street.trim(), city: city.trim(),
          state: state.trim(), country, pincode, saveAs,
          courierBranch: courierBranch || '', isDefault: !!isDefault
        }]
      });
    } else {
      if (isDefault) userAddressDoc.address.forEach(addr => addr.isDefault = false);
      userAddressDoc.address.push({
        name: name.trim(), email: email.trim(), number: number.toString(),
        houseName: houseName.trim(), street: street.trim(), city: city.trim(),
        state: state.trim(), country, pincode, saveAs,
        courierBranch: courierBranch || '', isDefault: !!isDefault
      });
    }
    await userAddressDoc.save();
    return res.status(200).json({ success: true, message: "Address added successfully" });
  } catch (error) {
    console.error("Add Address Error:", error);
    if (error.name === 'ValidationError') return res.status(400).json({ success: false, message: "Invalid data provided" });
    return res.status(500).json({ success: false, message: "Internal server error. Please try again." });
  }
};

const getEditAddress = async function (req, res, next) {
  try {
    const userId = req.session.user?._id || req.session.user;
    const { addressId } = req.params;
    if (!userId) return res.redirect('/login');
    if (!mongoose.Types.ObjectId.isValid(addressId)) return res.status(400).render('error', { message: 'Invalid address ID', statusCode: 400 });
    const userAddress = await Address.findOne({ userId });
    if (!userAddress) return res.status(404).render('error', { message: 'No addresses found', statusCode: 404 });
    const address = userAddress.address.id(addressId);
    if (!address) return res.status(404).render('error', { message: 'Address not found', statusCode: 404 });
    const user = await User.findById(userId);
    res.render('user/editAddress', { title: 'Edit Address', address, user, messages: {} });
  } catch (error) {
    console.error('Error fetching address for edit:', error);
    next(error);
  }
};

const updateAddress = async function (req, res) {
  try {
    const userId = req.session.user?._id || req.session.user;
    const { addressId, name, email, number, houseName, street, city, state, country, pincode, saveAs, isDefault, courierBranch } = req.body;
    if (!userId) return res.status(401).json({ success: false, message: 'Authentication required' });
    if (!addressId || !name || !email || !number || !houseName || !street || !city || !state || !country || !pincode || !saveAs) {
      return res.status(400).json({ success: false, message: "All required fields must be filled" });
    }
    if (!mongoose.Types.ObjectId.isValid(addressId)) return res.status(400).json({ success: false, message: "Invalid address ID" });
    const nameRegex = /^[a-zA-Z\s]{2,50}$/;
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const phoneRegex = /^[6-9]\d{9}$/;
    const pincodeRegex = /^\d{6}$/;
    if (!nameRegex.test(name.trim())) return res.status(400).json({ success: false, message: 'Name should contain only letters and spaces (2-50 characters)' });
    if (!emailRegex.test(email.trim())) return res.status(400).json({ success: false, message: 'Please enter a valid email address' });
    if (!phoneRegex.test(number.toString())) return res.status(400).json({ success: false, message: 'Phone number should be 10 digits starting with 6-9' });
    if (!pincodeRegex.test(pincode)) return res.status(400).json({ success: false, message: "Pincode should be exactly 6 digits" });
    if (!['Home', 'Work', 'Other'].includes(saveAs)) return res.status(400).json({ success: false, message: 'Invalid address type' });
    const textFields = [houseName, street, city, state];
    for (let field of textFields) {
      if (field.trim().length < 2 || field.trim().length > 100) return res.status(400).json({ success: false, message: 'Address fields should be between 2-100 characters' });
    }
    const userAddress = await Address.findOne({ userId });
    if (!userAddress) return res.status(401).json({ success: false, message: 'Address document not found' });
    const addressToUpdate = userAddress.address.id(addressId);
    if (!addressToUpdate) return res.status(400).json({ success: false, message: 'Address not found' });
    if (isDefault) userAddress.address.forEach(addr => addr.isDefault = false);
    addressToUpdate.name = name.trim();
    addressToUpdate.email = email.trim();
    addressToUpdate.number = number.toString();
    addressToUpdate.houseName = houseName.trim();
    addressToUpdate.street = street.trim();
    addressToUpdate.city = city.trim();
    addressToUpdate.state = state.trim();
    addressToUpdate.country = country;
    addressToUpdate.pincode = pincode;
    addressToUpdate.saveAs = saveAs;
    addressToUpdate.isDefault = Boolean(isDefault);
    addressToUpdate.courierBranch = courierBranch ? courierBranch.trim() : '';
    await userAddress.save();
    res.status(200).json({ success: true, message: 'Address updated successfully', data: { addressId: addressToUpdate._id, updatedAddress: addressToUpdate } });
  } catch (error) {
    console.error('Error updating address:', error);
    if (error.name === 'ValidationError') {
      const validationErrors = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({ success: false, message: validationErrors.join(', ') });
    }
    if (error.code === 11000) return res.status(400).json({ success: false, message: 'Duplicate address information found' });
    res.status(500).json({ success: false, message: 'Failed to update address. Please try again later.' });
  }
};

const setDefaultAddress = async function (req, res, next) {
  try {
    const userId = req.session.user?._id || req.session.user;
    const { addressId } = req.body;
    if (!userId) return res.status(401).json({ success: false, message: 'Authentication required' });
    if (!addressId) return res.status(400).json({ success: false, message: 'Address ID is required' });
    if (!mongoose.Types.ObjectId.isValid(addressId)) return res.status(400).json({ success: false, message: 'Invalid address ID format' });
    const userAddress = await Address.findOne({ userId });
    if (!userAddress) return res.status(404).json({ success: false, message: 'No addresses found for this user' });
    const targetAddress = userAddress.address.id(addressId);
    if (!targetAddress) return res.status(404).json({ success: false, message: 'Address not found' });
    if (targetAddress.isDefault) return res.status(400).json({ success: false, message: 'This address is already set as default' });
    userAddress.address.forEach(addr => addr.isDefault = false);
    targetAddress.isDefault = true;
    await userAddress.save();
    res.status(200).json({ success: true, message: 'Default address updated successfully', data: { addressId: targetAddress._id, addressType: targetAddress.saveAs } });
  } catch (error) {
    next(error);
  }
};

const deleteAddress = async function (req, res, next) {
  try {
    const userId = req.session.user?._id || req.session.user;
    const { addressId } = req.body;
    if (!userId) return res.status(401).json({ success: false, message: 'Authentication required' });
    if (!addressId) return res.status(400).json({ success: false, message: 'Address ID is required' });
    if (!mongoose.Types.ObjectId.isValid(addressId)) return res.status(400).json({ success: false, message: 'Invalid address ID format' });
    const userAddress = await Address.findOne({ userId });
    if (!userAddress) return res.status(404).json({ success: false, message: 'No addresses found for this user' });
    const addressToDelete = userAddress.address.id(addressId);
    if (!addressToDelete) return res.status(404).json({ success: false, message: 'Address not found' });
    if (addressToDelete.isDefault) return res.status(400).json({ success: false, message: 'Cannot delete default address. Please set another address as default first.' });
    const deletedAddressInfo = { name: addressToDelete.name, saveAs: addressToDelete.saveAs, city: addressToDelete.city };
    userAddress.address.pull(addressId);
    await userAddress.save();
    res.status(200).json({ success: true, message: 'Address deleted successfully', data: { deletedAddress: deletedAddressInfo, remainingAddressCount: userAddress.address.length } });
  } catch (error) {
    console.log('Error deleting address:', error);
    next(error);
  }
};

const getAddressForModal = async function (req, res) {
  try {
    const userId = req.session.user?._id || req.session.user;
    const { addressId } = req.params;
    if (!userId) return res.status(401).json({ success: false, message: 'Login required' });
    if (!mongoose.Types.ObjectId.isValid(addressId)) return res.status(400).json({ success: false, message: 'Invalid address ID' });
    const userAddress = await Address.findOne({ userId });
    if (!userAddress) return res.status(404).json({ success: false, message: 'No addresses found' });
    const address = userAddress.address.id(addressId);
    if (!address) return res.status(404).json({ success: false, message: 'Address not found' });
    res.json({ success: true, address });
  } catch (error) {
    console.log("", error);
    res.status(500).json({ success: false, message: 'Failed to fetch address' });
  }
};

// The old fix function is no longer necessary; we can keep it but it won't harm.
const fixExistingProfileImages = async () => {
  // This can be kept for any remaining old local paths; no action needed.
  console.log("fixExistingProfileImages is no longer required after Cloudinary migration.");
};

module.exports = {
  userProfile,
  editProfile,
  updateProfile,
  deleteProfileImage,
  changePassword,
  updatePassword,
  verifyProfileOtp,
  resendProfileOtp,
  getAddresses,
  addAddress,
  addNewAddress,
  getEditAddress,
  updateAddress,
  setDefaultAddress,
  deleteAddress,
  getAddressForModal,
  fixExistingProfileImages
};