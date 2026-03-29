const User = require("../../models/userSchema");
const nodemailer = require("nodemailer");
const bcrypt = require("bcrypt");
const { render } = require("ejs");
const Product = require("../../models/productSchema");
const Category = require("../../models/categorySchema");
const Offer = require("../../models/offerSchema");
const Cart = require("../../models/cartSchema");
const Address = require("../../models/addressSchema")
const { default: mongoose } = require("mongoose");
const { session } = require("passport");
const { json } = require("stream/consumers");
const { interpolators } = require("sharp");
require("dotenv").config()

const loadSignup = async function (req, res) {
    try {
        return res.render('user/signup')
    } catch (error) {
        console.log("home page not loading", error);
        res.status(500).send("server Error")
    }
};


const pageNotFound = async function (req, res) {
    try {
        res.render("user/page-404")
    } catch (error) {
        res.redirect("pageNotFound");
    }
};


function generateOtp() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

async function sendEmailVerification(email, otp) {

    try {

        if (!process.env.NODEMAILER_EMAIL || !process.env.NODEMAILER_PASSWORD) {
            console.error("Email credential not configured properly");
            return false;
        }

        const transport = await nodemailer.createTransport({
            host: "smtp.gmail.com",
            port: 465,
            secure: true,
            auth: {
                user: process.env.NODEMAILER_EMAIL,
                pass: process.env.NODEMAILER_PASSWORD
            }
        });

        transport.verify((error, success) => {
            if (error) {
                console.log("Transport verify error", error)
            } else {
                console.log("server is ready to take message", success)
            }
        });

        const info = await transport.sendMail({
            from: process.env.NODEMAILER_EMAIL,
            to: email,
            subject: "Verify your account?",
            text: `Your OTP is : ${otp}`,
            html: `<b> Your OTP is : ${otp} </b>`,
        })


        return info.accepted.length > 0

    } catch (error) {
        console.error("Error , sending mail", error);
        return false;
    }

}

const signup = async function (req, res) {
    try {

        const { name, phone, email, password, confirmPassword } = req.body;

        if (password !== confirmPassword) {
            return res.render('user/signup', { message: "Password dose not matching" });
        }

        const findUser = await User.findOne({ email });

        if (findUser) {
            return res.render('user/signup', { message: "User already exists" });
        }

        const otp = generateOtp();

        const emailSend = await sendEmailVerification(email, otp);

        if (!emailSend) {
            return res.json({ message: "Email-Error" });
        }

        req.session.userOtp = otp;
        req.session.userData = { firstName: req.body.firstName, lastName: req.body.lastName, phone, email, password };
        req.session.otpExpiry = Date.now() + 10 * 60 * 1000;

        res.render('user/verify-otp', {
            timer: "00:30",
            message: ""
        });
        console.log("OTP send", otp)

    } catch (error) {

        console.error("Sign up error", error);
        // res.redirect('/pageNotFound');

    }
}

const securePassword = async function (password) {
    try {
        const hashPass = await bcrypt.hash(password, 10);
        return hashPass
    } catch (error) {

    }
}

const verify_otp = async function (req, res) {

    try {

        const otp = req.body.otp;


        const existUser = await User.findOne({ email: req.session.userData.email });
        if (existUser) {
            return res.status(400).json({ success: false, message: "User Already exists" });
        }

        if (otp === String(req.session.userOtp)) {
            const user = req.session.userData;
            const hashPassword = await securePassword(user.password);

            const saveUserData = new User({
                firstName: user.firstName,
                lastName: user.lastName,
                email: user.email,
                phone: user.phone,
                password: hashPassword,
                isRole: user.isRole || 'user'
            });

            await saveUserData.save();
            // req.session.user = { _id: saveUserData._id };
            return res.status(200).json({ success: true, message: "OTP verified,please log in", redirectUrl: "/login" })

        } else {
            return res.status(400).json({ success: false, message: "Invalid or expired OTP" });
        }

    } catch (error) {
        console.error("Error verifing otp", error);
        res.status(500).json({ success: false, message: "An error occured" })
    }

}

const resend_otp = async function (req, res) {

    try {

        const { email } = req.session.userData;

        if (!email) {
            return res.status(400).json({ success: false, message: "Email not found in session" });
        }

        const otp = generateOtp();
        req.session.userOtp = otp;

        const emailSend = await sendEmailVerification(email, otp);

        if (emailSend) {
            console.log("resend OTP Success", otp);
            res.status(200).json({ success: true, message: "Resend OTP success" });
        } else {
            res.status(500).json({ success: false, message: "Resend OTP faild . please try again" });
        }

    } catch (error) {
        console.error("Resending OTP Error", error);
        res.status(400).json({ success: false, message: "Internal server error . please try again" });
    }

}


const loadlogin = async function (req, res) {

    try {
        if (!req.session.user) {
            res.render("user/user-login")
        } else {
            res.redirect('/')
        }


    } catch (error) {
        res.redirect('/pageNotFound')
    }

}

const login = async function (req, res) {
    try {

        const { email, password } = req.body;

        const findUser = await User.findOne({ email });

        if (!findUser) {
            console.log('user not found ')
            return res.render("user/user-login", { message: 'user not found' })
        }

        if (!findUser.isActive) {
            console.log("user is blocked");
            return res.render('user/user-login', { message: "user is blocked by admin" })
        }
        console.log("login password", password);
        console.log("stored hashpass", findUser.password);

        if (!password || !findUser.password) {
            console.log("Missing password values");
            return res.render("user/user-login", { message: "Password missing" });
        }

        const passwordMatch = await bcrypt.compare(password, findUser.password);

        if (!passwordMatch) {
            console.log("incorrect password")
            return res.render("user/user-login", { message: "Password missing" });
        }

        req.session.user = { _id: findUser._id, email: findUser.email };

        console.log('Login succuss');
        return res.redirect('/')


    } catch (error) {
        console.log("Login error:", error)
        return res.redirect('user/user-login', { message: "Login failed, try again later" });
    }
}

const logout = async function (req, res) {


    try {
        delete req.session.user;
        return res.redirect('/login');
    } catch (error) {
        console.log("Logout error", error);
        return res.redirect('/pageNotFound');
    }



    // try {

    //     req.session.destroy(err =>{

    //         if(err) {
    //             console.log("logout error", err);
    //             return res.render('/pageNotFound');
    //         }
    //         return res.redirect('/login');

    //     })

    // } catch (error) {

    //     console.log("logout", error)
    //     return res.render('/pageNotFound');
    // };

};





const applyOffers = async (products) => {
  try {
    const currentDate = new Date();
    console.log("Current Date:", currentDate);

    const activeOffers = await Offer.find({
      status: true,
      startDate: { $lte: currentDate },
      endDate: { $gte: currentDate },
    });

    console.log("Active Offers Found:", activeOffers.length);
    
    if (activeOffers.length === 0) {
      console.log("No active offers found");
      return products.map(product => {
        const productWithoutOffer = product.toObject();
        productWithoutOffer.hasOffer = false;
        return productWithoutOffer;
      });
    }

    console.log("Active Offers:", activeOffers.map(o => ({
      name: o.offerName,
      type: o.offerType,
      discount: o.discount,
      categoryIds: o.categoryId.map(id => id.toString())
    })));

    const productsWithOffers = products.map((product) => {
      const productWithOffer = product.toObject();
      
      // Convert IDs to strings for comparison
      const productId = product._id.toString();
      const productCategoryId = product.category?._id?.toString() || product.category?.toString();

      console.log(`Checking product: ${product.productName}`);
      console.log(`Product ID: ${productId}`);
      console.log(`Product Category ID: ${productCategoryId}`);

      // Check if product has any applicable offers
      const applicableOffers = activeOffers.filter((offer) => {
        if (offer.offerType === "product") {
          return offer.productId.some(id => id.toString() === productId);
        } else if (offer.offerType === "category") {
          // Check if this product's category matches any category in the offer
          return offer.categoryId.some(id => id.toString() === productCategoryId);
        }
        return false;
      });

      console.log(`Applicable offers for ${product.productName}:`, applicableOffers.length);

      if (applicableOffers.length > 0) {
        const maxDiscount = Math.max(
          ...applicableOffers.map((offer) => offer.discount)
        );

        // Calculate discounted price (if discount is 100%, price becomes 0)
        const discountedPrice = product.salePrice * (1 - maxDiscount / 100);

        productWithOffer.originalPrice = product.salePrice;
        productWithOffer.discountedPrice = Math.round(discountedPrice);
        productWithOffer.discountPercentage = maxDiscount;
        productWithOffer.hasOffer = true;
        
        console.log(`Applied ${maxDiscount}% discount to ${product.productName}:`, {
          originalPrice: product.salePrice,
          discountedPrice: productWithOffer.discountedPrice,
          finalPrice: discountedPrice
        });
      } else {
        productWithOffer.hasOffer = false;
      }

      return productWithOffer;
    });

    // Log summary of products with offers
    const productsWithOffersCount = productsWithOffers.filter(p => p.hasOffer).length;
    console.log(`Total products with offers: ${productsWithOffersCount} out of ${productsWithOffers.length}`);

    return productsWithOffers;
  } catch (error) {
    console.error("Error applying offers:", error);
    return products.map(product => {
      const productWithoutOffer = product.toObject();
      productWithoutOffer.hasOffer = false;
      return productWithoutOffer;
    });
  }
};




const loadHome = async function (req, res) {
    try {
        const user = req.session.user;
        console.log("session log", user);

        // Find only listed categories
        const listedCategories = await Category.find({ isListed: true }).select("_id");

        let filter = {
            isBlocked: false,
            category: { $in: listedCategories.map(c => c._id) }
        };

        if (req.query.category) {
            filter.category = req.query.category
        }
        if (req.query.categoryAttribute) {
            filter.categoryAttribute = new RegExp(req.query.categoryAttribute, "i")
        }
        if (req.query.size) {
            filter.size = new RegExp(req.query.size, "i")
        }
        if (req.query.minPrice || req.query.maxPrice) {
            filter.salePrice = {};
            if (req.query.minPrice) {
                filter.salePrice.$gte = parseInt(req.query.minPrice);
            }
            if (req.query.maxPrice) {
                filter.salePrice.$lte = parseInt(req.query.maxPrice);
            }
        }

        if (req.query.color) {
            filter.color = new RegExp(req.query.color, "i")
        }
        if (req.query.status && req.query.status !== 'all') {
            filter.status = req.query.status
        }

        if (req.query.search) {
            filter.$or = [
                { productName: new RegExp(req.query.search, 'i') },
                { description: new RegExp(req.query.search, 'i') }
            ];
        }

        let sortOptions = {};

        const sortBy = req.query.sortBy || 'newest';

        switch (sortBy) {
            case 'price_low':
                sortOptions = { salePrice: 1 };
                break;
            case 'price_high':
                sortOptions = { salePrice: -1 };
                break;
            case 'name_asc':
                sortOptions = { productName: 1 };
                break;
            case 'name_desc':
                sortOptions = { productName: -1 };
                break;
            case 'newest':
                sortOptions = { createdOn: -1 };
                break;
            case 'oldest':
                sortOptions = { createdOn: 1 };
                break;
            case 'popularity':
                sortOptions = { quantity: -1 };
                break;
            default:
                sortOptions = { createdAt: -1 } // Fixed: CreateAt -> createdAt
        }

        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 12;
        const skip = (page - 1) * limit; // This was missing!

        // Get products WITHOUT .lean() because applyOffers needs mongoose documents
        const products = await Product.find(filter)
            .populate('category', 'name attributes')
            .skip(skip)
            .limit(limit)
            .sort(sortOptions);
            // Removed .lean() here

        // Apply offers to products
        const productsWithOffers = await applyOffers(products);

        const totalProducts = await Product.countDocuments(filter);
        const totalPages = Math.ceil(totalProducts / limit);

        const categories = await Category.find({ isListed: true }).lean();

        const allColor = await Product.distinct('color', { isBlocked: false });
        const sizes = await Product.distinct('size', { isBlocked: false });
        const categoryAttributes = await Product.distinct('categoryAttribute', { isBlocked: false });

        const priceRange = await Product.aggregate([
            { $match: { isBlocked: false } },
            { $group: { _id: null, minPrice: { $min: "$salePrice" }, maxPrice: { $max: "$salePrice" } } }
        ]);

        const currentFilters = {
            category: req.query.category || '',
            categoryAttribute: req.query.categoryAttribute || '',
            size: req.query.size || '',
            minPrice: req.query.minPrice || '',
            maxPrice: req.query.maxPrice || '',
            color: req.query.color || '',
            status: req.query.status || 'all',
            search: req.query.search || '',
            sortBy,
            limit
        }

   // Common data to pass to the view
        const viewData = {
            currentPage: page,
            totalPage: totalPages,
            totalProduct: totalProducts,
            products: productsWithOffers,
            categories,
            categoryAttributes,
            sizes,
            colors: allColor,
            priceRange: priceRange[0] || { minPrice: 0, maxPrice: 100000 },
            currentFilters,
            query: req.query
        };


        if (user) {
            const userData = await User.findById(user._id).lean();
            if (userData) {
                userData.name = userData.name || `${userData.firstName} ${userData.lastName}`;
            }
            return res.render("user/home", {
                 ...viewData,
                user: userData,
                currentPage: page,
                totalPage: totalPages,
                totalProduct: totalProducts,
                products: productsWithOffers, // Use products with offers
                categories,
                categoryAttributes,
                sizes,
                colors: allColor,
                priceRange: priceRange[0] || { minPrice: 0, maxPrice: 100000 },
                currentFilters,
                query: req.query
            });
        } else {
            return res.render("user/home", {
                 ...viewData,
                user: null,
                currentPage: page,
                totalPage: totalPages,
                totalProduct: totalProducts,
                products: productsWithOffers, // Use products with offers
                categories,
                categoryAttributes,
                sizes,
                colors: allColor,
                priceRange: priceRange[0] || { minPrice: 0, maxPrice: 100000 },
                currentFilters,
                query: req.query
            });
        }

    } catch (error) {
        console.error("shop page not found", error);
        return res.redirect("/");
    }
}



const loadProduct = async function (req, res) {
    try {
        const user = req.session.user;
        const productId = req.params.id;

        if (!mongoose.Types.ObjectId.isValid(productId)) {
            return res.status(404).render("page-404", { error: "Invalid ProductId" });
        }

        const productData = await Product.findById(productId)
            .populate("category", "name")
            .populate("categoryAttribute", "name");
            // Remove .lean() here

        if (!productData || productData.isBlocked) {
            return res.status(404).render('page-404', { error: "Product not found" });
        }

        // Apply offers to single product
        const productsWithOffers = await applyOffers([productData]);
        const productWithOffer = productsWithOffers[0];

        const query = {
            category: productData.category._id,
            _id: { $ne: productData._id },
            isBlocked: false
        };

        if (productData.categoryAttribute) {
            query.categoryAttribute = productData.categoryAttribute;
        }

        // Get related products and apply offers to them too
        const relatedProducts = await Product.find(query)
            .limit(4)
            .populate('category', 'name')
            .populate('categoryAttribute', 'name');
            // Remove .lean() here

        const relatedProductsWithOffers = await applyOffers(relatedProducts);

        if (user) {
            const userData = await User.findById(user._id);
            return res.render("user/product", { 
                user: userData, 
                product: productWithOffer, // Use product with offers
                relatedProducts: relatedProductsWithOffers // Use related products with offers
            });
        } else {
            return res.render("user/product", { 
                user: null, 
                product: productWithOffer, // Use product with offers
                relatedProducts: relatedProductsWithOffers // Use related products with offers
            });
        }

    } catch (error) {
        console.log("Error occure in page loading:", error);
        return res.status(500).render("page-404", { error: "Something went wrong.Please try again" });
    }
}



const getWishlist = async function (req, res) {
    try {
        const userId = req.session.user?._id;

        if (!userId) {
            return res.render("user/login")
        }

        const user = await User.findById(userId).populate({
            path: "wishlist.productId",
            populate: {
                path: "category",
                select: "name"
            }
        });

        let wishlistProducts = user
            ? user.wishlist
                .map(item => item.productId)
                .filter(product => product && !product.isBlocked)
            : [];

        // Apply offers to wishlist products
        if (wishlistProducts.length > 0) {
            wishlistProducts = await applyOffers(wishlistProducts);
            
            // Optional: Log to verify offers are applied
            console.log("Wishlist products with offers:", 
                wishlistProducts.map(p => ({
                    name: p.productName,
                    hasOffer: p.hasOffer,
                    discount: p.discountPercentage,
                    originalPrice: p.originalPrice,
                    discountedPrice: p.discountedPrice
                }))
            );
        }

        res.render("user/wishlist", {
            wishlist: wishlistProducts,
            user: user,
            currentPage: 'wishlist'
        })

    } catch (error) {
        console.log("getWishlist error:", error)
        res.status(500).json({ success: false, message: "server error" })
    }
}


const addToWishlist = async function (req, res) {
    try {
        const userId = req.session.user?._id;
        const { productId } = req.body;

        if (!userId) {
            return res.status(401).json({ success: false, message: "Please login to add items to wishlist" })
        }

        const product = await Product.findById(productId);
        if (!product) {
            return res.status(404).json({
                success: false,
                message: "product not found"
            })
        }

        const user = await User.findById(userId);

        const exists = user.wishlist.some(
            (item) => item.productId.toString() === productId
        );

        if (exists) {
            return res.status(400).json({
                success: false,
                exists: true,
                message: "Product already in wishlist"
            });
        }

        user.wishlist.push({ productId });
        await user.save();

        // Update session wishlist count
        req.session.wishlistCount = user.wishlist.length;

        // Get full wishlist data for sync
        const populatedUser = await User.findById(userId).populate({
            path: "wishlist.productId",
            populate: {
                path: "category",
                select: "name"
            }
        });

        const wishlistProducts = populatedUser.wishlist
            .map(item => item.productId)
            .filter(product => product && !product.isBlocked);

        return res.json({
            success: true,
            message: "Product added to wishlist",
            wishlistCount: user.wishlist.length,
            wishlistData: wishlistProducts // Send full wishlist data for sync
        });

    } catch (error) {
        console.log("addToWishlist error:", error);
        return res.status(500).json({
            success: false,
            message: "Something went wrong"
        })
    }
}

const removeFromWishlist = async function (req, res) {
    try {
        const userId = req.session.user?._id;
        const productId = req.params.productId;

        if (!userId) {
            return res.status(401).json({ success: false, message: "Please log in" });
        }
        
        const user = await User.findById(userId);

        if (!user) {
            return res.status(401).json({ success: false, message: "user not found" });
        }

        user.wishlist = user.wishlist.filter((item) => item.productId.toString() !== productId);
        await user.save();

        // Update session wishlist count
        req.session.wishlistCount = user.wishlist.length;

        // Get updated wishlist data
        const populatedUser = await User.findById(userId).populate({
            path: "wishlist.productId",
            populate: {
                path: "category",
                select: "name"
            }
        });

        const wishlistProducts = populatedUser.wishlist
            .map(item => item.productId)
            .filter(product => product && !product.isBlocked);

        return res.status(200).json({
            success: true,
            message: "Product removed from wishlist",
            wishlistCount: user.wishlist.length,
            wishlistData: wishlistProducts
        });

    } catch (error) {
        console.log("removeFromWishlist error:", error);
        res.status(500).json({ success: false, message: "Server error" });
    }
}



const toggleWishlist = async (req, res) => {
    try {
        const userId = req.session.user?._id;
        const { productId } = req.body;

        if (!userId) return res.status(401).json({ success: false, message: 'Not logged in' });
        if (!productId) return res.status(400).json({ success: false, message: 'Product ID required' });

        // Check if product exists
        const product = await Product.findById(productId);
        if (!product) {
            return res.status(404).json({ success: false, message: 'Product not found' });
        }

        const user = await User.findById(userId);
        if (!user) return res.status(404).json({ success: false, message: 'User not found' });

        const index = user.wishlist.findIndex(item => item.productId.toString() === productId);
        let message = '';

        if (index > -1) {
            // Remove from wishlist
            user.wishlist.splice(index, 1);
            message = 'Removed from wishlist';
        } else {
            // Add to wishlist
            user.wishlist.push({ productId });
            message = 'Added to wishlist';
        }

        await user.save();
        req.session.wishlistCount = user.wishlist.length;

        // Get full wishlist data for sync
        const populatedUser = await User.findById(userId).populate({
            path: "wishlist.productId",
            populate: {
                path: "category",
                select: "name"
            }
        });

        const wishlistProducts = populatedUser.wishlist
            .map(item => item.productId)
            .filter(product => product && !product.isBlocked);

        return res.json({
            success: true,
            message: message,
            inWishlist: index === -1, // true if added, false if removed
            wishlistCount: user.wishlist.length,
            wishlistData: wishlistProducts // Send full wishlist data for sync
        });
    } catch (error) {
        console.error('Toggle wishlist error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};




// const loadContact = async function (req, res) {
//     try {
//         let user = req.session?.user;
//         if (user) {
//             const userData = await User.findById(req.session?.user?._id)
//             return res.render('user/contact', { user: userData })
//         } else {
//             return res.render('user/home', { user: null })
//         }

//     } catch (error) {

//         console.log("loadContact", error);
//         res.render('/')
//     }

// }
const loadContact = async function (req, res) {
    try {
        let user = req.session?.user;
        
        // Common data for the contact page
        const viewData = {
            currentFilters: {}, // Empty object for contact page
            query: {},
            categories: [],
            currentPage: 1,
            totalPage: 1,
            totalProduct: 0,
            products: [],
            categoryAttributes: [],
            sizes: [],
            colors: [],
            priceRange: { minPrice: 0, maxPrice: 0 }
        };
        
        if (user) {
            const userData = await User.findById(req.session?.user?._id);
            return res.render('user/contact', { 
                ...viewData,
                user: userData 
            });
        } else {
            return res.render('user/contact', { 
                ...viewData,
                user: null 
            });
        }

    } catch (error) {
        console.log("loadContact", error);
        return res.redirect('/');
    }
};

const loadAbout = async function (req, res) {
    try {
        let user = req.session?.user;
        
        // Common data for the about page
        const viewData = {
            currentFilters: {}, // Empty object for about page
            query: {},
            categories: [],
            currentPage: 1,
            totalPage: 1,
            totalProduct: 0,
            products: [],
            categoryAttributes: [],
            sizes: [],
            colors: [],
            priceRange: { minPrice: 0, maxPrice: 0 }
        };
        
        if (user) {
            const userData = await User.findById(req.session?.user?._id);
            return res.render('user/about', { 
                ...viewData,
                user: userData 
            });
        } else {
            return res.render('user/about', { 
                ...viewData,
                user: null 
            });
        }

    } catch (error) {
        console.log("loadabout", error);
        return res.redirect('/');
    }
};


module.exports = {
    login,
    loadlogin,
    verify_otp,
    loadSignup,
    signup,
    loadHome,
    logout,
    resend_otp,
    loadProduct,
    pageNotFound,
    loadContact,
    getWishlist,
    toggleWishlist,
    addToWishlist,
    removeFromWishlist,
    loadAbout
}