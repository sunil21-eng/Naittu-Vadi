const User = require('../../models/userSchema');
const nodemailer = require('nodemailer');
const bcrypt = require('bcrypt');
const session = require('express-session');
require("dotenv").config();


function generateOtp() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

const sendVerificationEmail = async function (email, otp) {

    try {
        const transport = await nodemailer.createTransport({
            service: 'gmail',
            secure: false,
            port: 587,
            requireTLS: false,
            auth: {
                user: process.env.NODEMAILER_EMAIL,
                pass: process.env.NODEMAILER_PASSWORD
            }
        });

        const mailInfo = await transport.sendMail({

            from: process.env.NODEMAILER_EMAIL,
            to: email,
            subject: " Artimes verification code for forgot password",
            text: `Your OTP is :${otp}`,
            html: `<b> Your OTP is :${otp} </b>`
        });

        return true;

    } catch (error) {
        console.log("send mail error:", error);
        return false;
    }
};


const securePassword = async function (password) {

    try {
        const hashPass = await bcrypt.hash(password, 10)
        return hashPass;

    } catch (error) {
        console.log("password hashig error:", error)
    }

}


const loadForgot = async function (req, res) {

    try {
        res.render("user/forgotPassword")
    } catch (error) {
        console.log('error to load forgot password:', error)
        return res.status(500).json({ success: false, error: "Internam server error" });

    }
}


const forgotPasword = async function (req, res) {

    try {
        const { email } = req.body
        const findUser = await User.findOne({ email: email });
        if (!findUser) {
            return res.render("user/forgotPassword",{error: "No account found with that email" })
        }
        const otp = generateOtp();
        const emailSend = await sendVerificationEmail(email, otp);

        if (!emailSend) {
            return res.status(404).json({ success: false, error: "send verification mail error" })
        }

        req.session.otp = otp;
        req.session.email = email;
        req.session.otpExpiry = Date.now() + 10 * 60 * 1000
        res.render("user/forgotVerify-otp");
        console.log("forgot reset otp:", otp);

    } catch (error) {
        console.log("forgot password error:", error);
        return res.render('pageNotFound')
    }


}

const forgotResendOtp = async function (req, res) {

    try {
        const email = req.session.email;
        if (!email) {
            return res.status(404).json({ success: false, massage: "email not found from sesstion" });
        }
        const otp = generateOtp();
        req.session.otp = otp;
        const sendEmail = sendVerificationEmail(email, otp);

        if (!sendEmail) {
            return res.status(404).json({ success: false, message: "Error to send otp into mail" });
        }
        return res.status(202).json({ success: true })

    } catch (error) {

        console.log("error in resnd otp :", error)
        return res.status(404).json({ success: false, message: "internal server error" });

    }

}

const verifyForgototp = async function (req, res) {
    try {
        const enderedOtp = (req.body.otp || "").trim();
        console.log(`userOtp in session:${req.session?.otp},
            user input otp:${enderedOtp}`);
        if (!enderedOtp) {
            return res.status(404).json({ success: false, message: "OTP required" });
        }
        if (enderedOtp === req.session?.otp) {
            req.session.resetEmail = req.session.email;
            req.session.resetVerified = true;
            return res.status(200).json({ success: true,  message: "OTP verified",redirectUrl: "/resetPassword"})
        } else {
            return res.status(400).json({ success: false, message: "Invalid or expired OTP" });
        }

    } catch (error) {
        console.error("OTP verification error:", error);
        return res.status(500).json({ success: false, message: "Internal server error.Please try again" });
    }
};

const getResetPassword = async function (req, res) {

    try {
        res.render("user/resetPassword");

    } catch (error) {
        console.log("error to load reset password page:", error);
        return res.render('/pageError')
    }

}

const resetPassword = async function (req, res) {
    try {
        const { password, confirmPassword } = req.body;

        if (!password || !confirmPassword) {
            return res.status(404).json({ success: false, message: "Password required" });
        }
        const trimPass = password.trim();
        const trimConfirmPass = confirmPassword.trim();

        if (trimPass !== trimConfirmPass) {
            return res.status(404).json({ success: false, message: "password does not match" })
        }

        const strongEnough = trimPass.length >= 8 && /[A-Z]/.test(trimPass) && /[a-z]/.test(trimPass) && /\d/.test(trimPass);

        if (!strongEnough) {
            return res.status(404).json({
                success: false,
                message: "Password must be 8+ chars with upper, lower, and a digit"
            });
        }

        const userMail = req.session?.resetEmail;

        if (!userMail) {
            return res.status(404).json({ success: false, message: "User not found in session" });
        }

        const findUser = await User.findOne({ email: userMail });

        if (!findUser) {
            return res.status(404).json({ success: false, message: "User not found" });
        }

        const hashPass = await securePassword(trimPass);


        await User.findOneAndUpdate({ _id: findUser._id }, { $set: { password: hashPass } });

        delete req.session.resetEmail;
        delete req.session.resetVerified;
        delete req.session.userOtp;
        delete req.session.otpExpiry;
        return res.status(200).json({ success: true,redirectUrl: "/login" })


    } catch (error) {
        console.log("error in reset password:", error)
        return res.json({ success: false, redirectUrl: "/pageError" });
    }

}

module.exports = {
    loadForgot,
    forgotPasword,
    verifyForgototp,
    getResetPassword,
    forgotResendOtp,
    resetPassword
}