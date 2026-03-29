const mongoose = require('mongoose');
const { Schema } = mongoose;

const productSchema = new Schema({
    productName: {
        type: String,
        required: true
    },
    description: {
        type: String,
        required: true
    },
    regularPrice: {
        type: Number,
        required: true
    },
    salePrice: {
        type: Number,
        required: true
    },
    discount: {
        type: Number,
        default: 0
    },
    color: {
        type: String,
        required: true
    },
    images: {
        type: [String],
        required: true
    },
    size: {
        type: String,
        required: true
    },
    isBlocked: {
        type: Boolean,
        default: false
    },
    category: {
        type: Schema.Types.ObjectId,
        ref: "Category",
        required: true
    },
    categoryAttribute: {
        type: String,
        required: true
    },
    quantity: {
        type: Number,
        default: 0
    },
    createdOn: {
        type: Date,
        default: Date.now
    },
    updatedOn: {
        type: Date,
        default: Date.now
    }
});

const Product = mongoose.model("Product", productSchema);

module.exports = Product;