const User = require('../../models/userSchema');
const bcrypt = require('bcrypt');
const session = require('express-session');
require("dotenv").config();

function generateOtp() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

const sendVerificationEmail = async function (email, otp) {
    try {
        if (!process.env.BREVO_API_KEY) {
            console.error("BREVO_API_KEY is not configured");
            return false;
        }
        if (!process.env.BREVO_FROM_EMAIL) {
            console.error("BREVO_FROM_EMAIL is not configured");
            return false;
        }

        const data = {
            sender: {
                name: process.env.BREVO_FROM_NAME || "Nattuvedi - Artemis",
                email: process.env.BREVO_FROM_EMAIL,
            },
            to: [{ email: email }],
            subject: "Artimes verification code for forgot password",
            textContent: `Your OTP is: ${otp}`,
            htmlContent: `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Nattuvedi – OTP Verification</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f7fc;font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
    <table align="center" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;background-color:#ffffff;margin:30px auto;border-radius:16px;box-shadow:0 10px 40px rgba(0,0,0,0.06);border-collapse:collapse;">
        <!-- HEADER -->
        <tr>
            <td style="padding:28px 40px 16px;text-align:center;border-bottom:1px solid #eef3f9;">
                <h1 style="margin:0;font-size:26px;font-weight:700;letter-spacing:-0.3px;color:#0b1a33;">
                    <span style="color:#3a86ff;">🔥</span> Nattuvedi
                    <span style="color:#3a86ff;">–</span>
                    <span style="color:#ff006e;">Artemis</span> Crackers
                </h1>
                <p style="margin:4px 0 0;font-size:13px;color:#7a8ba8;letter-spacing:0.3px;font-weight:500;">
                    Premium country crackers since 2010 &bull; Celebrate safely
                </p>
            </td>
        </tr>
        <!-- BODY -->
        <tr>
            <td style="padding:32px 40px 24px;">
                <h2 style="margin:0 0 6px;font-size:22px;font-weight:600;color:#0b1a33;">Forgot Password?</h2>
                <p style="margin:0 0 18px;font-size:15px;color:#4a5b74;line-height:1.6;">
                    We received a request to reset the password for your <strong>Nattuvedi – Artemis</strong> account. Use the verification code below to proceed.
                </p>
                <table cellpadding="0" cellspacing="0" border="0" style="width:100%;background:#f8faff;border-radius:12px;border:1px solid #e6edf8;margin:8px 0 18px;">
                    <tr>
                        <td style="padding:28px 20px;text-align:center;">
                            <p style="margin:0 0 10px;font-size:13px;font-weight:600;color:#3a86ff;text-transform:uppercase;letter-spacing:1.2px;">Verification Code</p>
                            <div style="display:inline-block;background:#ffffff;border-radius:10px;padding:14px 32px;border:1px solid #dce6f2;box-shadow:0 2px 6px rgba(58,134,255,0.06);">
                                <span style="font-size:38px;font-weight:700;letter-spacing:6px;color:#0b1a33;font-family:'Courier New',monospace;">${otp}</span>
                            </div>
                            <p style="margin:16px 0 0;font-size:13px;color:#7a8ba8;">⏱ This code is valid for <strong style="color:#0b1a33;">10 minutes</strong>.</p>
                        </td>
                    </tr>
                </table>
                <table cellpadding="0" cellspacing="0" border="0" style="width:100%;background:#fcf5f0;border-radius:10px;border-left:4px solid #ff6b6b;margin:20px 0 6px;">
                    <tr>
                        <td style="padding:14px 18px;">
                            <p style="margin:0;font-size:13px;color:#7a5a44;line-height:1.5;">
                                <span style="font-weight:600;">🔒 Security tip:</span> Never share this OTP with anyone. Nattuvedi – Artemis will never ask for your code via phone, chat, or email.
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
                            <span style="font-weight:800;color:#3a86ff;font-size:18px;letter-spacing:0.3px;">🔥 Nattuvedi – Artemis Crackers</span><br />
                            <span style="color:#4a5b74;font-size:13px;line-height:1.5;display:block;margin:4px 0 0;">Premium Nattu Vedi country crackers &amp; Sivakasi crackers since 2010. Making celebrations sparkle! 🎆</span>
                        </td>
                    </tr>
                    <tr>
                        <td style="padding:6px 0 8px;text-align:center;">
                            <span style="color:#2d4059;font-size:13px;display:inline-block;line-height:1.7;"><i style="color:#3a86ff;">📞</i> +91 78688 29460 &nbsp;|&nbsp;<i style="color:#3a86ff;">✉️</i> opensurfaces21@gmail.com &nbsp;|&nbsp;<i style="color:#3a86ff;">📍</i> Singarapettai - 635307</span><br />
                            <span style="display:inline-block;margin-top:6px;background:#fff0f0;padding:4px 14px;border-radius:20px;color:#ff6b6b;font-size:12px;font-weight:600;">⚠️ 18+ Only • Celebrate Safely</span>
                        </td>
                    </tr>
                    <tr>
                        <td style="padding:4px 0 12px;text-align:center;color:#4a5b74;font-size:13px;"><i style="color:#3a86ff;">🏪</i> Dharmaraja nagar • <i style="color:#3a86ff;">🏭</i> Singarapettai, Krishnagiri</td>
                    </tr>
                    <tr>
                        <td style="border-top:1px solid #eef3f9;padding-top:16px;text-align:center;color:#7a8ba8;font-size:12px;line-height:1.6;"><span><i style="color:#3a86ff;">©</i> 2024 Nattuvedi – Artemis Crackers &nbsp;•&nbsp; Made with <span style="color:#ff006e;">❤️</span></span><br /><span style="display:inline-block;margin-top:4px;"><i style="color:#3a86ff;">🆔</i> Sale to minors prohibited</span></td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
    <div style="text-align:center;font-size:11px;color:#9aabbf;padding:10px 20px 30px;font-family:'Segoe UI',Roboto,Arial,sans-serif;">This email was sent to <span style="color:#4a5b74;">${email}</span><br />If you received this by mistake, please disregard it.</div>
</body>
</html>
            `
        };

        const response = await fetch("https://api.brevo.com/v3/smtp/email", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "api-key": process.env.BREVO_API_KEY,
            },
            body: JSON.stringify(data),
        });

        if (response.ok) {
            const result = await response.json();
            console.log("Brevo email sent successfully. Message ID:", result.messageId);
            return true;
        } else {
            const errorBody = await response.json();
            console.error("Brevo email error:", errorBody);
            return false;
        }

    } catch (error) {
        console.error("Brevo email error:", error.message);
        return false;
    }
};

const securePassword = async function (password) {
    try {
        const hashPass = await bcrypt.hash(password, 10);
        return hashPass;
    } catch (error) {
        console.error("Password hashing error", error);
        return null;
    }
};

const loadForgot = async function (req, res) {
    try {
        res.render("user/forgotPassword");
    } catch (error) {
        return res.status(500).json({ success: false, error: "Internal server error" });
    }
};

const forgotPasword = async function (req, res) {
    try {
        const { email } = req.body;
        const findUser = await User.findOne({ email: email });
        if (!findUser) {
            return res.render("user/forgotPassword", { error: "No account found with that email" });
        }
        const otp = generateOtp();
        const emailSend = await sendVerificationEmail(email, otp);

        if (!emailSend) {
            return res.status(404).json({ success: false, error: "send verification mail error" });
        }

        req.session.otp = otp;
        req.session.email = email;
        req.session.otpExpiry = Date.now() + 10 * 60 * 1000;
        res.render("user/forgotVerify-otp");
    } catch (error) {
        return res.render('pageNotFound');
    }
};

const forgotResendOtp = async function (req, res) {
    try {
        const email = req.session.email;
        if (!email) {
            return res.status(404).json({ success: false, massage: "email not found from sesstion" });
        }
        const otp = generateOtp();
        req.session.otp = otp;
        const sendEmail = await sendVerificationEmail(email, otp);

        if (!sendEmail) {
            return res.status(404).json({ success: false, message: "Error to send otp into mail" });
        }
        return res.status(202).json({ success: true });
    } catch (error) {
        return res.status(404).json({ success: false, message: "internal server error" });
    }
};

const verifyForgototp = async function (req, res) {
    try {
        const enderedOtp = (req.body.otp || "").trim();
        console.log(`userOtp in session:${req.session?.otp}, user input otp:${enderedOtp}`);
        if (!enderedOtp) {
            return res.status(404).json({ success: false, message: "OTP required" });
        }
        if (enderedOtp === req.session?.otp) {
            req.session.resetEmail = req.session.email;
            req.session.resetVerified = true;
            return res.status(200).json({ success: true, message: "OTP verified", redirectUrl: "/resetPassword" });
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
        return res.render('/pageError');
    }
};

const resetPassword = async function (req, res) {
    try {
        const { password, confirmPassword } = req.body;

        if (!password || !confirmPassword) {
            return res.status(404).json({ success: false, message: "Password required" });
        }
        const trimPass = password.trim();
        const trimConfirmPass = confirmPassword.trim();

        if (trimPass !== trimConfirmPass) {
            return res.status(404).json({ success: false, message: "password does not match" });
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
        return res.status(200).json({ success: true, redirectUrl: "/login" });

    } catch (error) {
        return res.json({ success: false, redirectUrl: "/pageError" });
    }
};

module.exports = {
    loadForgot,
    forgotPasword,
    verifyForgototp,
    getResetPassword,
    forgotResendOtp,
    resetPassword
};