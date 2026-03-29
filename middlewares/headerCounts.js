
const Cart = require("../models/cartSchema");
const User = require("../models/userSchema");

const getHeaderCounts = async (req, res, next) => {
    try {
        if (req.session.user) {
            const userId = req.session.user._id;
            
            // Get cart count
            const cart = await Cart.findOne({ userId });
            let cartCount = 0;
            if (cart && cart.items) {
                cartCount = cart.items.reduce((total, item) => total + item.quantity, 0);
            }
            
            // Get wishlist count
            const user = await User.findById(userId).select('wishlist');
            let wishlistCount = 0;
            if (user && user.wishlist) {
                wishlistCount = user.wishlist.length;
            }
            
            // Make counts available to all templates
            res.locals.cartCount = cartCount;
            res.locals.wishlistCount = wishlistCount;
            
            // Also store in session for quick access
            req.session.cartCount = cartCount;
            req.session.wishlistCount = wishlistCount;


        } else {
            // Default counts for non-logged in users
            res.locals.cartCount = 0;
            res.locals.wishlistCount = 0;
        }
        next();
    } catch (error) {
        console.error('Error getting header counts:', error);
        // Set default counts on error
        res.locals.cartCount = 0;
        res.locals.wishlistCount = 0;
        next();
    }
};


const count = async (req, res) => {
    try {
        const userId = req.session.user._id;
        
        // Get cart count
        const cart = await Cart.findOne({ userId });
        let cartCount = 0;
        if (cart && cart.items) {
            cartCount = cart.items.reduce((total, item) => total + item.quantity, 0);
        }
        
        // Get wishlist count
        const user = await User.findById(userId).select('wishlist');
        let wishlistCount = 0;
        if (user && user.wishlist) {
            wishlistCount = user.wishlist.length;
        }
        
        res.json({
            success: true,
            cartCount,
            wishlistCount
        });
    } catch (error) {
        console.error('Error getting header counts:', error);
        res.json({
            success: false,
            cartCount: 0,
            wishlistCount: 0
        });
    }
};

module.exports = {getHeaderCounts,count}