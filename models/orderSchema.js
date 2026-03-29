const mongoose = require("mongoose");
const { Schema } = mongoose;

const orderSchema = new mongoose.Schema(
 {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
    },
    cartId: {
      type: Schema.Types.ObjectId,
      ref: "Cart",
    },
    orderedItem: [
      {
        productId: {
          type: Schema.Types.ObjectId,
          ref: "Product",
        },
        quantity: {
          type: Number,
          required: true,
        },
        size: {
          type: String,
          required: true,
        },
        productPrice: {
          type: Number,
          required: true,
        },
        totalProductPrice: {
          type: Number,
          required: true,
        },
        // REMOVED individual product status - use order status instead
        offer_id: {
          type: mongoose.Schema.Types.ObjectId,
        },
      },
    ],
    deliveryAddress: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Address",
      required: true,
    },
    orderAmount: {
      type: Number,
      required: true,
    },
    deliveryDate: {
      type: Date,
    },
    shippingDate: {
      type: Date,
    },
    paymentMethod: {
      type: String,
      required: true,
    },
    paymentStatus: {
      type: String,
      enum: ["Pending", "Paid", "Failed", "Refunded"],
      default: "Pending",
      required: true,
    },
    orderNumber: {
      type: String,
    },
    // Main order status - controls everything
    orderStatus: {
      type: String,
      enum: ["Pending", "Confirmed", "Shipped", "Delivered", "Cancelled", "Returned"],
      default: "Pending",
    },
    razorpayOrderId: {
      type: String,
      default: null
    },
    razorpayPaymentId: {  
      type: String,
      default: null
    },
    razorpaySignature: {
      type: String,
      default: null
    },
    paymentDate: {
      type: Date
    },
    couponDiscount: {
      type: Number,
      default: 0
    },
    couponCode: {
      type: String,
      default: null
    },
    // Add return fields at order level
    returnReason: {
      type: String,
    },
    returnStatus: {
      type: String,
      enum: ["Requested", "Approved", "Completed", "Rejected"],
    },
    returnRequestDate: Date,
    returnApproved: {
      type: Boolean,
      default: false,
    },
    returnApprovedDate: Date,
    returnNotes: String,
    isRefunded: {
      type: Boolean,
      default: false
    }
  },
  { timestamps: true }
);

const Orders = mongoose.model("orders", orderSchema);
module.exports = Orders