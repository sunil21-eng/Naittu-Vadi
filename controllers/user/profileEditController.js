const User = require('../../models/userSchema');
const Address = require('../../models/addressSchema');
const bcrypt = require('bcrypt');
const fs = require('fs');
const path = require('path');
const nodemailer = require('nodemailer');
const { session } = require('passport');
const { default: mongoose } = require('mongoose');


const userProfile = async function (req, res) {

    try {
        const userId = req.session.user?._id || req.session.user;

        const user = await User.findById(userId);

        if (!user) return res.render('user/login')

        return res.render('user/userProfile', { user })

    } catch (error) {
        console.log("load userProfile:", error);
        res.status(500).send("Error loading profile")
    }

}


const editProfile = async function (req, res) {
    try {
        const userId = req.session.user?._id || req.session.user;

        const user = await User.findById(userId)
        if (!user) {
            return res.render('user/login')
        } else {
            return res.render('user/editProfile', { user })
        }
    } catch (error) {
        console.log("load editProfile error:", error);
        return res.status(500).send("Error loading edit profile")
    }

}

const updateProfile = async function (req, res) {

    try {
        
        console.log("File received from Multer:", req.file);

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

        if (email && email !== user.email) {

            const otp = generateOtp();
            req.session.profileOtp = otp;
            req.session.profileOtpExpiry = Date.now() + 10 * 60 * 1000 // 10 minutes

            req.session.pendingProfileData = {
                firstName: firstName.trim(),
                lastName: lastName.trim(),
                email: email.trim(),
                phone: phone ? phone.trim() : null,
                dob: dob || null
            }

            if (req.file) {

                req.session.pendingProfileData.profileImage = [`/uploads/profileImages/${req.file.filename}`];
            }

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

        user.firstName = firstName.trim();
        user.lastName = lastName.trim();
        user.phone = phone ? phone.trim() : null;
        user.dob = dob || null;


        if (req.file) {
            user.profileImage = [`/uploads/profileImages/${req.file.filename}`];;
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

}

const deleteProfileImage = async function (req, res) {

    try {

        const user = await User.findById(req.session.user);

        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        if (user.profileImage && user.profileImage.length > 0) {


            // Extract just the filename from the stored path
            const imagePath = user.profileImage[0];
            const filename = path.basename(imagePath); // This gets just the filename
            const filePath = path.join(__dirname, `../public/uploads/profileImages/${filename}`);


            try {
                if (fs.existsSync(filePath)) {
                    await fs.promises.unlink(filePath);// delete the file
                }
                console.log("Profile image deleted:", filePath);
            } catch (err) {
                console.error("File delete error:", err);
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

}


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

        // apply pending updates
        Object.assign(user, req.session.pendingProfileData);
        await user.save();


        // clear session
        req.session.profileOtp = null;
        req.session.profileOtpExpiry = null;
        req.session.pendingProfileData = null;
        if (req.file) {
            req.session.pendingProfileData.profileImage = [`/uploads/profileImages/${req.file.filename}`];
        }

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
        req.session.profileOtpExpiry = Date.now() + 10 * 60 * 1000; // 10 minutes

        const emailSent = await sendEmailVerification(req.session.pendingProfileData.email, otp);

        if (!emailSent) {
            return res.status(500).json({ error: 'Failed to resend OTP email' });
        }

        return res.json({
            success: true,
            message: 'New OTP sent to your email address'
        });

    } catch (error) {
        console.error("resendProfileOtp error:", error);
        return res.status(500).json({ error: "Server error" });
    }
};

function generateOtp() {
    return Math.floor(100000 + Math.random() * 900000).toString(); // 6-digit
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

        const { currentPassword, newPassword, confirmPassword } = req.body

        if (!req.session.user) {
            return res.status(401).json({ success: false, message: "Please Login in to continue" })
        }

        if (!currentPassword || !newPassword || !confirmPassword) {
            return res.status(400).json({ success: false, message: "All fields are required" })
        }

        const passwordRegex = /^(?=.*[A-Z])(?=.*\d).{8,}$/;
        if (!passwordRegex.test(newPassword)) {
            return res.status(401).json({ success: false, message: "New password must be at least 8 characters with 1 uppercase letter and 1 number" })
        }

        if (newPassword !== confirmPassword) {
            return res.status(400).json({
                success: false,
                message: "NewPassword and ConfirmPassword Doesnt match"
            })
        }

        const user = await User.findById(req.session.user)

        if (!user) {
            return res.status(400).json({ success: false, message: "User not found" })
        }

        if (!user.password) {
            return res.status(400).json({ success: false, message: "Cannot change passwords for Social login accounts" })
        }

        const isCurrentPasswordValid = await bcrypt.compare(currentPassword, user.password)
        if (!isCurrentPasswordValid) {
            return res.status(400).json({ success: false, message: "Current Password is incorrect" })
        }

        const isSamePassword = await bcrypt.compare(newPassword, user.password)
        if (isSamePassword) {
            return res.status(400).json({ success: false, message: "NewPassword must be different from the  Current Password" })
        }

        const saltRounds = 10
        const hashedNewPassword = await bcrypt.hash(newPassword, saltRounds)

        await User.findByIdAndUpdate(
            req.session.user,
            { password: hashedNewPassword },
            { new: true }
        )

        return res.json({ success: true, message: "Succesfully Updated Password" })

    } catch (error) {
        next(error);
    }
}

const getAddresses = async function (req, res) {

    try {
        const userId = req.session.user?._id || req.session.user;

        if (!userId) {
            return res.render('user/login');
        }

        const user = await User.findById(userId);

        if (!user) {
            return res.render('user/login');
        }

        const addressDoc = await Address.findOne({ userId: userId })

        const addresses = addressDoc?.address || [];

        const messages = {
            success: req.query.success || null,
            error: req.query.error || null
        };

        res.render('user/address', {
            user: user,
            addresses: addresses,
            title: 'Addresses - AllScouts',
            messages
        })
    } catch (error) {
        console.log("loadgetAddresses error:", error);
        res.redirect('user/profile')

    }

}

const addAddress = async function (req, res, next) {
    try {
        const userId = req.session.user?._id || req.session.user;

        if (!userId) {
            return res.render('user/login');
        }

        const user = await User.findById(userId);
        if (!user) {
            return res.render('user/login');
        }
        return res.render('user/addAddress', { user, title: "Add Address - Allscouts", messages: {} })

    } catch (error) {
        next(error)

    }
}

function validateAddress(data) {
    const { name, email, number, houseName, street, city, state, country, pincode, saveAs } = data

    if (!name || !email || !number || !houseName || !street || !city || !state || !country || !pincode || !saveAs) {
        return { success: false, message: "All required fields must be filled" };
    }

    if (!/^[a-zA-Z\s]{2,50}$/.test(name.trim())) {
        return { success: false, message: "Name should contain only letters and spaces (2-50 characters)" };
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email.trim())) {
        return { success: false, message: "Please enter a valid email address" };
    }
    const phoneStr = number.toString();

    if (!/^[6-9]\d{9}$/.test(phoneStr)) {
        return { success: false, message: "Phone number should be 10 digits starting with 6-9" };
    }

    if (!/^\d{6}$/.test(pincode)) {
        return { success: false, message: "Pincode should be exactly 6 digits" };
    }

    const textFields = [
        { field: houseName, name: "House name" },
        { field: street, name: "Street address" },
        { field: city, name: "City" },
        { field: state, name: "State" }
    ];
    for (let textField of textFields) {
        if (!textField.field.trim() || textField.field.trim().length < 2 || textField.field.trim().length > 100) {
            return { success: false, message: `${textField.name} should be between 2-100 characters` };
        }
    }

    // SaveAs validation
    if (!["Home", "Work", "Other"].includes(saveAs)) {
        return { success: false, message: "Invalid address type selected" };
    }

    return { success: true };
}

const addNewAddress = async function (req, res) {

    try {
       
        const validation = validateAddress(req.body);

        if (!validation.success) {
            return res.status(400).json(validation);
        }

        const {
            name, email, number, houseName, street,
            city, state, country, pincode, saveAs,courierBranch, isDefault
        } = req.body;

        if (!req.session.user) {
            return res.status(401).json({
                success: false,
                message: "Please login to continue"
            });
        }

        let userAddressDoc = await Address.findOne({ userId: req.session.user });

        if (!userAddressDoc) {
            // First address for this user → create new document
            userAddressDoc = new Address({
                userId: req.session.user,
                address: [{
                    name: name.trim(),
                    email: email.trim(),
                    number: number.toString(),
                    houseName: houseName.trim(),
                    street: street.trim(),
                    city: city.trim(),
                    state: state.trim(),
                    country,
                    pincode,
                    saveAs,
                    courierBranch: courierBranch || '',
                    isDefault: !!isDefault
                }]
            });
        } else {
            // If isDefault = true, set all existing addresses to false
            if (isDefault) {
                userAddressDoc.address.forEach(addr => {
                    addr.isDefault = false;
                });
            }

            userAddressDoc.address.push({
                name: name.trim(),
                email: email.trim(),
                number: number.toString(),
                houseName: houseName.trim(),
                street: street.trim(),
                city: city.trim(),
                state: state.trim(),
                country,
                pincode,
                saveAs,
                courierBranch: courierBranch || '',
                isDefault: !!isDefault
            });
        }
        await userAddressDoc.save();


        console.log("Address added successfully for user:", req.session.user);

        return res.status(200).json({
            success: true,
            message: "Address added successfully"
        });


    } catch (error) {
        console.error("Add Address Error:", error);
        if (error.name === 'ValidationError') {
            return res.status(400).json({
                success: false,
                message: "Invalid data provided"
            });
        }

        // Handle other errors
        return res.status(500).json({
            success: false,
            message: "Internal server error. Please try again."
        });

    }

}

const getEditAddress = async function (req, res, next) {

    try {

        const userId = req.session.user?._id || req.session.user;
        const { addressId } = req.params;


        if (!userId) {
            return res.redirect('/login');
        }

        if (!mongoose.Types.ObjectId.isValid(addressId)) {
            return res.status(400).render('error', {
                message: 'Invalid address ID',
                statusCode: 400
            });
        }

        const userAddress = await Address.findOne({ userId });

        if (!userAddress) {
            return res.status(404).render('error', {
                message: 'No addresses found',
                statusCode: 404
            });
        }

        const address = userAddress.address.id(addressId)

        if (!address) {
            return res.status(404).render('error', {
                message: 'Address not found',
                statusCode: 404
            });
        }
         const user = await User.findById(userId);

        res.render('user/editAddress', {
            title: 'Edit Address',
            address: address,
            user: user,
            messages: {}
        })

    } catch (error) {
        console.error('Error fetching address for edit:', error);
        next(error)
    }

}

const updateAddress = async function (req, res) {

    try {
        const userId = req.session.user?._id || req.session.user;

        const { addressId, name, email, number, houseName, street, city, state, country, pincode, saveAs, isDefault,courierBranch  } = req.body

        if (!userId) {
            return res.status(401).json({
                success: false,
                message: 'Authentication required'
            });
        }

        if (!addressId || !name || !email || !number || !houseName || !street || !city || !state || !country || !pincode || !saveAs) {
            return res.status(400).json({ success: false, message: "All required fields must be filled" })
        }

        if (!mongoose.Types.ObjectId.isValid(addressId)) {
            return res.status(400).json({
                success: false,
                message: "Invalid address ID"
            }
            )
        }


        const nameRegex = /^[a-zA-Z\s]{2,50}$/;
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        const phoneRegex = /^[6-9]\d{9}$/;
        const pincodeRegex = /^\d{6}$/;


        if (!nameRegex.test(name.trim())) {
            return res.status(400).json({
                success: false,
                message: 'Name should contain only letters and spaces (2-50 characters)'
            })
        }

        if (!emailRegex.test(email.trim())) {
            return res.status(400).json({
                success: false,
                message: 'Please enter a valid email address'
            })
        }
        if (!phoneRegex.test(number.toString())) {
            return res.status(400).json({
                success: false,
                message: 'Phone number should be 10 digits starting with 6-9'
            })
        }
        if (!pincodeRegex.test(pincode)) {
            return res.status(400).json({
                success: false,
                message: "Pincode should be exactly 6 digits"
            })
        }
        if (!['Home', 'Work', 'Other'].includes(saveAs)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid address type'
            });
        }

        // Validate text fields length

        const textFields = [houseName, street, city, state];
        for (let field of textFields) {
            if (field.trim().length < 2 || field.trim().length > 100) {
                return res.status(400).json({
                    success: false,
                    message: 'Address fields should be between 2-100 characters'
                });
            }
        }
        // Find the user's address document

        const userAddress = await Address.findOne({ userId });

        if (!userAddress) {
            return res.status(401).json({
                success: false,
                message: 'Address document not found'
            });
        }

        const addressToUpdate = userAddress.address.id(addressId)

        if (!addressToUpdate) {
            return res.status(400).json({
                success: false,
                message: 'Address not found'
            });
        }

        // If setting as default, first unset all other default addresses
        if (isDefault) {
            userAddress.address.forEach(addr => {
                addr.isDefault = false;
            });
        }

        // Update the address fields
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

        res.status(200).json({
            success: true,
            message: 'Address updated successfully',
            data: {
                addressId: addressToUpdate._id,
                updatedAddress: addressToUpdate
            }
        });




    } catch (error) {
        console.error('Error updating address:', error);

        // Handle MongoDB validation errors
        if (error.name === 'ValidationError') {
            const validationErrors = Object.values(error.errors).map(err => err.message);
            return res.status(400).json({
                success: false,
                message: validationErrors.join(', ')
            });
        }

        // Handle duplicate key errors (if any unique constraints)
        if (error.code === 11000) {
            return res.status(400).json({
                success: false,
                message: 'Duplicate address information found'
            });
        }

        res.status(500).json({
            success: false,
            message: 'Failed to update address. Please try again later.'
        });
    }

}

const setDefaultAddress = async function (req, res, next) {

    try {

        const userId = req.session.user?._id || req.session.user;
        const { addressId } = req.body;


        if (!userId) {
            return res.status(401).json({
                success: false,
                message: 'Authentication required'
            })
        }
        if (!addressId) {
            return res.status(400).json({
                success: false,
                message: 'Address ID is required'
            })
        }
        if (!mongoose.Types.ObjectId.isValid(addressId)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid address ID format'
            });
        }

        const userAddress = await Address.findOne({ userId });

        if (!userAddress) {
            return res.status(404).json({
                success: false,
                message: 'No addresses found for this user'
            })
        }

        const targetAddress = userAddress.address.id(addressId);

        if (!targetAddress) {
            return res.status(404).json({
                success: false,
                message: 'Address not found'
            });
        }
        if (targetAddress.isDefault) {
            return res.status(400).json({
                success: false,
                message: 'This address is already set as default'
            })
        }
        userAddress.address.forEach(addr => {
            addr.isDefault = false;
        });

        targetAddress.isDefault = true;

        await userAddress.save()

        res.status(200).json({
            success: true,
            message: 'Default address updated successfully',
            data: {
                addressId: targetAddress._id,
                addressType: targetAddress.saveAs
            }
        });


    } catch (error) {
        next(error);
    }

}


const deleteAddress = async function (req, res, next) {
    try {

        const userId = req.session.user?._id || req.session.user;
        const { addressId } = req.body;


        if (!userId) {
            return res.status(401).json({
                success: false,
                message: 'Authentication required'

            })
        }

        if (!addressId) {
            return res.status(400).json({
                success: false,
                message: 'Address ID is required'

            })
        }

        if (!mongoose.Types.ObjectId.isValid(addressId)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid address ID format'
            })
        }


        const userAddress = await Address.findOne({ userId });

        if (!userAddress) {
            return res.status(404).json({
                success: false,
                message: 'No addresses found for this user'
            })
        }

        const addressToDelete = userAddress.address.id(addressId);


        if (!addressToDelete) {
            return res.status(404).json({
                success: false,
                message: 'Address not found'
            });
        }

        // Check if trying to delete a default address
        if (addressToDelete.isDefault) {
            return res.status(400).json({
                success: false,
                message: 'Cannot delete default address. Please set another address as default first.'
            });
        }

        // Store address info for response (before deletion)
        const deletedAddressInfo = {
            name: addressToDelete.name,
            saveAs: addressToDelete.saveAs,
            city: addressToDelete.city
        };

        userAddress.address.pull(addressId);

        await userAddress.save();

        res.status(200).json({
            success: true,
            message: 'Address deleted successfully',
            data: {
                deletedAddress: deletedAddressInfo,
                remainingAddressCount: userAddress.address.length
            }
        });


    } catch (error) {
        console.log('Error deleting address:', error);
        next(error)

    }



}


const getAddressForModal = async function (req, res) {
    try {

        const userId = req.session.user?._id || req.session.user;
        const { addressId } = req.params;

        if (!userId) {
            return res.status(401).json({
                success: false,
                message: 'Login required'

            })
        }

        if (!mongoose.Types.ObjectId.isValid(addressId)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid address ID'
            })
        }

        const userAddress = await Address.findOne({ userId });
        if (!userAddress) {
            return res.status(404).json({ success: false, message: 'No addresses found' });
        }

        const address = userAddress.address.id(addressId)
        if (!address) {
            return res.status(404).json({
                success: false,
                message: 'Address not found'
            });
        }

        res.json({
            success: true,
            address
        });



    } catch (error) {
        console.log("", error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch address'
        });
    }

}

const fixExistingProfileImages = async () => {
    try {
        const users = await User.find({
            profileImage: {
                $exists: true,
                $ne: []
            }
        });

        console.log(`Found ${users.length} users with profile images to fix`);

        for (let user of users) {
            if (user.profileImage && user.profileImage.length > 0) {
                const oldPath = user.profileImage[0];
                // Check if it's an absolute path
                if (oldPath.includes('public\\uploads\\profileImages\\') || oldPath.includes('C:')) {
                    // Extract just the filename
                    const filename = oldPath.split('\\').pop();
                    // Create new relative path
                    user.profileImage = [`/uploads/profileImages/${filename}`];
                    await user.save();
                    console.log(`Updated user ${user._id}: ${oldPath} -> ${user.profileImage[0]}`);
                }
            }
        }
        console.log('All profile images fixed successfully');
    } catch (error) {
        console.error('Error fixing profile images:', error);
    }
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
}