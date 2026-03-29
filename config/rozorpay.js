const Razorpay = require("razorpay");
const path = require('path');
const dotenv = require('dotenv')
dotenv.config({ path: path.join(__dirname, '/config.env') });

console.log("Environment Check:", {
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET ? "Loaded" : "Missing",
});

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

module.exports = razorpay;