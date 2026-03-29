const mongoose = require('mongoose');
const { Schema } = mongoose;

const cartSchema = new mongoose.Schema({
    userId: {
        type: Schema.Types.ObjectId,
        ref: "User",
        required: true
    },
    items: [{
        productId: {
            type: Schema.Types.ObjectId,
            ref: "Product",
            required: true
        },
        quantity: {
            type: Number,
            required: true,
            min: 1
        },
        size: {
            type: String,
            required: true
        },
        price: {
            type: Number,
            required: true
        },
        offerPrice: {
            type: Number,
            default: null
        },
        stock: {
            type: Number,
            required: true
        },
        total: {
            type: Number,
            required: true
        },
        offer_id: {
            type: Schema.Types.ObjectId,
            ref: 'Offer',
            default:null
        }
    }],
    cartTotal: {
        type: Number,
        required: true,
        default:null
    }
}, { timestamps: true,strictPopulate:false});

const Cart = mongoose.model('Cart', cartSchema);

module.exports = Cart;
