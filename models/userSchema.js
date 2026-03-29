const mongoose = require("mongoose");

const { Schema } = mongoose;

const userSchema = new Schema({
    firstName: {
        type: String,
        required: true,
    },
    lastName: {
        type: String,
        required: true,
    },
    //<---google user-->
    name: { type: String },
    googleId: { type: String },
     //<---google user-->

    email: {
        type: String,
        required: true,
        unique: true,
    },
    phone: {
        type: String,
        required: false,
        unique: false,
        sparse: true,
        default: null
    },
    password: {
        type: String,
        required: false
    },
    isActive: {
        type: Boolean,
        default: true
    },
    isAdmin: {
        type: Boolean,
        default: false
    },
     dob:{
        type: String,
        required:false,
    },
    profileImage:{
        type: Array,
        required: false,
    },
    createdOn: {
        type: Date,
        default: Date.now
    },
    updatedOn: {
        type: Date,
        default: Date.now
    },
    referalCode: {
        type: String
    },
    referedBy: {
        type: Schema.Types.ObjectId,
        ref: "User",
        default: null
    },
      wishlist: [
      {
        productId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Product",
          required: true
        },
        dateAdded: {
          type: Date,
          default: Date.now
        }
      }
    ]
    
  })

const User = mongoose.model("User", userSchema);

module.exports = User;