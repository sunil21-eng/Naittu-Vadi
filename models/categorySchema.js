const mongoose = require('mongoose');

const { Schema } = mongoose;

const categorySchema = new Schema({


    name: {
        type: String,
        required: true,
        trim: true,
        unique: true
    },
    description: {
        type: String,
        required: true,
        trim: true
    },
    attributes: {
        type: [String],
        default: []
    },
    isListed: {
        type: Boolean,
        default:true

    },
    createdOn: {
        type: Date,
        default: Date.now
    },
    updatedOn: {
        type: Date,
        default: Date.now
    },


})

const Category = mongoose.model("Category", categorySchema);

module.exports = Category;