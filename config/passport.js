const passport = require("passport");
const googleStrategy = require("passport-google-oauth20").Strategy;
const User = require("../models/userSchema");
const path = require('path');
const dotenv = require('dotenv');
dotenv.config({ path: path.join(__dirname, '/config.env') });

console.log("GOOGLE_CLIENT_ID:", process.env.GOOGLE_CLIENT_ID);

passport.use(new googleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: 'http://localhost:5000/auth/google/callback'
},

    async function (accessToken, refreshToken, profile, done) {

        try {
            const email = profile.emails[0].value;

            let user = await User.findOne({ email });

            if (user) {
                if (!user.googleId) {
                    user.googleId = profile.id;
                    await user.save();
                }
                return done(null, user,{ status: "existing" });
            }

            user = await User.findOne({ googleId: profile.id });
            if (user) {
                return done(null, user,{ status: "existing" });
            }
            const fullName = profile.displayName.split(" ");
            const firstName = fullName[0];
            const lastName = fullName.slice(1).join(" ") || "";

            user = new User({
                firstName,
                lastName,
                email,
                googleId: profile.id,
                password: null
            });
            await user.save();


            return done(null, user, { status: "new" });
            
        } catch (error) {
            console.error("Google login error:", error);
            return done(error, null)
        }
    }

));

passport.serializeUser((user, done) => {

    done(null, user.id);

});

passport.deserializeUser((id, done) => {

    User.findById(id)
        .then(user => done(null, user))
        .catch(err => done(err, null))

})

module.exports = passport