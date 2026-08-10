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
    text: `Your Nattuvedi – Artemis verification code is: ${otp}. This code is valid for 10 minutes. Never share it with anyone. If you didn't request this, please ignore this email.`,
    html: `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Verify your Nattuvedi account</title>
</head>
<body style="margin:0;padding:0;background:#f4f7fc;font-family:Arial,sans-serif;">

<table align="center" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;background:#ffffff;margin:30px auto;border-radius:16px;border-collapse:collapse;">

    <!-- HEADER -->
    <tr>
        <td style="padding:28px 40px 16px;text-align:center;border-bottom:1px solid #eef3f9;">
            <h1 style="margin:0;font-size:26px;font-weight:700;color:#0b1a33;">
                <span style="color:#3a86ff;">🔥</span> Nattuvedi
                <span style="color:#3a86ff;">–</span>
                <span style="color:#ff006e;">Artemis</span> Crackers
            </h1>
            <p style="margin:4px 0 0;font-size:13px;color:#7a8ba8;">Premium country crackers since 2010</p>
        </td>
    </tr>

    <!-- BODY -->
    <tr>
        <td style="padding:32px 40px 24px;">
            <h2 style="margin:0 0 6px;font-size:22px;font-weight:600;color:#0b1a33;">Verify Your Email</h2>
            <p style="margin:0 0 18px;font-size:15px;color:#4a5b74;line-height:1.6;">
                Thank you for signing up with <strong>Nattuvedi – Artemis</strong>!
                Use the code below to complete your registration.
            </p>

            <!-- OTP BOX -->
            <table cellpadding="0" cellspacing="0" border="0" style="width:100%;background:#f8faff;border-radius:12px;border:1px solid #e6edf8;margin:8px 0 18px;">
                <tr>
                    <td style="padding:28px 20px;text-align:center;">
                        <p style="margin:0 0 10px;font-size:13px;font-weight:600;color:#3a86ff;text-transform:uppercase;letter-spacing:1.2px;">Verification Code</p>
                        <div style="display:inline-block;background:#ffffff;border-radius:10px;padding:14px 32px;border:1px solid #dce6f2;">
                            <span style="font-size:38px;font-weight:700;letter-spacing:6px;color:#0b1a33;font-family:'Courier New',monospace;">${otp}</span>
                        </div>
                        <p style="margin:16px 0 0;font-size:13px;color:#7a8ba8;">⏱ Valid for 10 minutes</p>
                    </td>
                </tr>
            </table>

            <!-- SECURITY TIP -->
            <table cellpadding="0" cellspacing="0" border="0" style="width:100%;background:#fcf5f0;border-radius:10px;border-left:4px solid #ff6b6b;margin:20px 0 6px;">
                <tr>
                    <td style="padding:14px 18px;">
                        <p style="margin:0;font-size:13px;color:#7a5a44;line-height:1.5;">
                            <span style="font-weight:600;">🔒 Security tip:</span>
                            Never share this code. Nattuvedi – Artemis will never ask for it.
                        </p>
                    </td>
                </tr>
            </table>
        </td>
    </tr>

    <!-- FOOTER -->
    <tr>
        <td style="padding:0 40px 30px;">
            <hr style="border:0;height:1px;background:#eef3f9;margin:0 0 22px;" />

            <table cellpadding="0" cellspacing="0" border="0" style="width:100%;">
                <tr>
                    <td style="padding-bottom:12px;text-align:center;">
                        <span style="font-weight:800;color:#3a86ff;font-size:18px;">🔥 Nattuvedi – Artemis Crackers</span><br />
                        <span style="color:#4a5b74;font-size:13px;display:block;margin-top:4px;">
                            Premium Nattu Vedi country crackers &amp; Sivakasi crackers since 2010.
                        </span>
                    </td>
                </tr>
                <tr>
                    <td style="padding:6px 0 8px;text-align:center;">
                        <span style="color:#2d4059;font-size:13px;line-height:1.7;">
                            📞 +91 78688 29460 &nbsp;|&nbsp;
                            ✉️ opensurfaces21@gmail.com &nbsp;|&nbsp;
                            📍 Singarapettai - 635307
                        </span><br />
                        <span style="display:inline-block;margin-top:6px;background:#fff0f0;padding:4px 14px;border-radius:20px;color:#ff6b6b;font-size:12px;font-weight:600;">
                            ⚠️ 18+ Only • Celebrate Safely
                        </span>
                    </td>
                </tr>
                <tr>
                    <td style="padding:4px 0 12px;text-align:center;color:#4a5b74;font-size:13px;">
                        🏪 Dharmaraja nagar • 🏭 Singarapettai, Krishnagiri
                    </td>
                </tr>
                <tr>
                    <td style="border-top:1px solid #eef3f9;padding-top:16px;text-align:center;color:#7a8ba8;font-size:12px;line-height:1.6;">
                        © 2024 Nattuvedi – Artemis Crackers &nbsp;•&nbsp; Made with ❤️<br />
                        <span style="display:inline-block;margin-top:4px;">🆔 Sale to minors prohibited</span>
                    </td>
                </tr>
            </table>
        </td>
    </tr>
</table>

<div style="text-align:center;font-size:11px;color:#9aabbf;padding:10px 20px 30px;font-family:Arial,sans-serif;">
    This email was sent to <span style="color:#4a5b74;">${email}</span><br />
    If you didn't request this, please ignore it.
</div>

</body>
</html>
    `
});


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
        if (req.query.minPrice || req.query.maxPrice) {
            filter.salePrice = {};
            if (req.query.minPrice) {
                filter.salePrice.$gte = parseInt(req.query.minPrice);
            }
            if (req.query.maxPrice) {
                filter.salePrice.$lte = parseInt(req.query.maxPrice);
            }
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
 
        // Default listing is oldest-first (createdOn ascending)
        const sortBy = req.query.sortBy || 'oldest';
 
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
                sortOptions = { createdOn: 1 } // Fallback also defaults to oldest-first
        }
 
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 12;
        const skip = (page - 1) * limit;
 
        // Get products WITHOUT .lean() because applyOffers needs mongoose documents
        const products = await Product.find(filter)
            .populate('category', 'name attributes')
            .skip(skip)
            .limit(limit)
            .sort(sortOptions);
 
        // Apply offers to products
        const productsWithOffers = await applyOffers(products);
 
        const totalProducts = await Product.countDocuments(filter);
        const totalPages = Math.ceil(totalProducts / limit);
 
        // Categories, sorted alphabetically (A-Z) so the sidebar/dropdowns
        // don't depend on the view to re-sort them.
        const categories = await Category.find({ isListed: true })
            .collation({ locale: 'en', strength: 2 })
            .sort({ name: 1 })
            .lean();
 
        // Attributes for EVERY listed category, computed in a single
        // aggregation, so the sidebar can nest attributes under each
        // category and keep the whole tree visible at all times (no
        // need to re-fetch/hide anything based on the current selection).
        const attributesAgg = await Product.aggregate([
            {
                $match: {
                    isBlocked: false,
                    category: { $in: listedCategories.map(c => c._id) },
                    categoryAttribute: { $nin: [null, ''] }
                }
            },
            {
                $group: {
                    _id: "$category",
                    attributes: { $addToSet: "$categoryAttribute" }
                }
            }
        ]);
 
        const attributesByCategory = {};
        attributesAgg.forEach(function (entry) {
            attributesByCategory[String(entry._id)] = entry.attributes.sort(function (a, b) {
                return String(a).localeCompare(String(b));
            });
        });
 
        const priceRange = await Product.aggregate([
            { $match: { isBlocked: false } },
            { $group: { _id: null, minPrice: { $min: "$salePrice" }, maxPrice: { $max: "$salePrice" } } }
        ]);
 
        const currentFilters = {
            category: req.query.category || '',
            categoryAttribute: req.query.categoryAttribute || '',
            minPrice: req.query.minPrice || '',
            maxPrice: req.query.maxPrice || '',
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
            attributesByCategory,
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
                user: userData
            });
        } else {
            return res.render("user/home", {
                ...viewData,
                user: null
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