const mongoose = require("mongoose");
const { Schema } = mongoose;

const walletSchema = new Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    balance: {
        type: Number,
        required: true,
        default: 0,
    },
    transaction: [{
        amount: {
            type: Number,
            required: true
        },
        transactionsMethod: {
            type: String,
            enum: ["Credit", "Debit", "Refund", "Referral", "Payment", "Razorpay","Wallet Payment"],
            required: true,
        },
        date: {
            type: Date,
            default: Date.now
        },
        orderId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'orders',
            required: false
        }
    }]
}, { timestamps: true });

const Wallet = mongoose.model("Wallet", walletSchema);

module.exports = Wallet;
