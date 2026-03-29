const User = require("../models/userSchema");

const userAuth = async (req, res, next) => {
    try {
        const sessionUserId = req.session.user?req.session.user._id:null;
        const passportUserId = req.user?req.user._id:null;
        const userId = sessionUserId || passportUserId;
        if (!userId) {
            return res.redirect("/login");
        }
        const user = await User.findById(userId);
        if (user && user.isActive) {
            req.currentUser = user;
            return next();
        } else {
            return res.redirect("/login");
        }
    } catch (error) {
        console.error("error in authendication middleware:", error);
        res.status(500).send("Internal server error");
    }
};

const adminAuth = (req, res, next) => {
    if (req.session && req.session.admin) {
        return next();
    } else {
        return res.redirect("/admin/login");
    }
};


const checkUserStatus = async (req, res, next) => {
    try {
        const userId = req.session.user?._id || req.user?._id;
        if (!userId) return next();

        const user = await User.findById(userId);

        if (!user) return next();

        // If user is blocked
        if (!user.isActive) {
            // Destroy session
            req.session.destroy(err => {
                if (err) console.log("Session destroy error:", err);
                // Redirect to login or blocked page
                return res.redirect("/login?blocked=true");
            });
        } else {
            next();
        }
    } catch (error) {
        console.error(error);
        next(error);
    }
};


module.exports = {
    userAuth,
    adminAuth,
    checkUserStatus
}