const Product = require("../../models/productSchema")
const User = require("../../models/userSchema")
const Cart = require("../../models/cartSchema")
const Offer = require("../../models/offerSchema");
const Address = require("../../models/addressSchema");
const Orders = require("../../models/orderSchema");
const Coupon = require("../../models/couponSchema");
const Wallet = require("../../models/walletSchema");
const razorpay = require("../../config/rozorpay");
const Razorpay = require("razorpay");
const mongoose = require('mongoose');
const PDFDocument = require('pdfkit')
const crypto = require('crypto')

// Helper function to apply offers to a single product
const applyOfferToProduct = async (product) => {
  try {
    const currentDate = new Date();

    const activeOffers = await Offer.find({
      status: true,
      startDate: { $lte: currentDate },
      endDate: { $gte: currentDate },
    });

    if (activeOffers.length === 0) {
      return {
        ...product.toObject ? product.toObject() : product,
        hasOffer: false
      };
    }

    const productObj = product.toObject ? product.toObject() : { ...product };
    
    // Get category ID safely
    let categoryId = null;
    if (product.category) {
      categoryId = product.category._id ? product.category._id.toString() : product.category.toString();
    }

    // Check if product has any applicable offers
    const applicableOffers = activeOffers.filter((offer) => {
      if (offer.offerType === "product") {
        return offer.productId.some(id => id.toString() === product._id.toString());
      } else if (offer.offerType === "category") {
        return categoryId && offer.categoryId.some(id => id.toString() === categoryId);
      }
      return false;
    });

    if (applicableOffers.length > 0) {
      const maxDiscount = Math.max(
        ...applicableOffers.map((offer) => offer.discount)
      );

      // Use salePrice or regularPrice for discount calculation
      const basePrice = product.salePrice || product.regularPrice || 0;
      const discountedPrice = basePrice * (1 - maxDiscount / 100);

      productObj.originalPrice = basePrice;
      productObj.discountedPrice = Math.round(discountedPrice);
      productObj.discountPercentage = maxDiscount;
      productObj.hasOffer = true;
      productObj.offerId = applicableOffers[0]._id; // Store the offer ID
    } else {
      productObj.hasOffer = false;
    }

    return productObj;
  } catch (error) {
    console.error("Error applying offer to product:", error);
    return {
      ...product.toObject ? product.toObject() : product,
      hasOffer: false
    };
  }
};

// Add new address
const addAddress = async (req, res) => {
    try {
        const userId = req.session.user;
        const {
            name,
            email,
            number,
            houseName,
            street,
            city,
            state,
            country,
            pincode,
            saveAs,
            isDefault
        } = req.body;

        // Validate required fields
        if (!name || !email || !number || !houseName || !street || !city || !state || !country || !pincode || !saveAs) {
            return res.status(400).json({
                success: false,
                message: 'All fields are required'
            });
        }

        // Validate email format
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return res.status(400).json({
                success: false,
                message: 'Please enter a valid email address'
            });
        }

        // Validate phone number
        if (number.toString().length < 10) {
            return res.status(400).json({
                success: false,
                message: 'Please enter a valid phone number'
            });
        }

        // Validate pincode
        if (pincode.length !== 6 || !/^\d{6}$/.test(pincode)) {
            return res.status(400).json({
                success: false,
                message: 'Please enter a valid 6-digit pincode'
            });
        }

        const newAddress = {
            name,
            email,
            number: number.toString(),
            houseName,
            street,
            city,
            state,
            country,
            pincode,
            saveAs,
            isDefault: isDefault || false
        };

        let userAddresses = await Address.findOne({ userId });

        if (!userAddresses) {
            // Create new address document for user
            userAddresses = new Address({
                userId,
                address: [{ ...newAddress, isDefault: true }] // First address is always default
            });
        } else {
            // If setting as default, update other addresses
            if (newAddress.isDefault) {
                userAddresses.address.forEach(addr => {
                    addr.isDefault = false;
                });
            }

            // If no addresses exist or this is the first address, make it default
            if (userAddresses.address.length === 0) {
                newAddress.isDefault = true;
            }

            userAddresses.address.push(newAddress);
        }

        await userAddresses.save();

        res.json({
            success: true,
            message: 'Address added successfully'
        });

    } catch (error) {
        console.error('Error adding address:', error);
        res.status(500).json({
            success: false,
            message: 'Error adding address'
        });
    }
};


// Get checkout page
const getCheckoutPage = async (req, res) => {
  try {
    const userId = req.session.user?._id;
    if (!userId) return res.redirect('/login');

    // Fetch user addresses
    const userAddresses = await Address.findOne({ userId });
    const addresses = userAddresses ? userAddresses.address : [];

    // Fetch cart items with complete product details
    const cart = await Cart.findOne({ userId }).populate({
      path: 'items.productId',
      select: 'productName salePrice regularPrice discount images quantity isBlocked color size category'
    });

    if (!cart || !cart.items || cart.items.length === 0) {
      return res.redirect('/cart');
    }

    // Calculate totals, stock status, and savings with offers
    let subtotal = 0;
    let totalItems = 0;
    let hasUnavailableItems = false;
    let totalProductSavings = 0;

    const cartItems = await Promise.all(cart.items.map(async (cartItem) => {
      const product = cartItem.productId;
      
      // Apply offer to get correct price
      const productWithOffer = await applyOfferToProduct(product);
      
      // Determine price based on offer
      let itemPrice;
      if (productWithOffer.hasOffer && productWithOffer.discountPercentage >= 100) {
        itemPrice = 0; // Free product
      } else if (productWithOffer.hasOffer) {
        itemPrice = productWithOffer.discountedPrice;
      } else {
        itemPrice = product.salePrice || product.regularPrice || 0;
      }
      
      const itemTotal = itemPrice * cartItem.quantity;
      subtotal += itemTotal;
      totalItems += cartItem.quantity;

      // Calculate savings
      const originalTotal = (product.regularPrice || product.salePrice || 0) * cartItem.quantity;
      if (originalTotal > itemTotal) {
        totalProductSavings += (originalTotal - itemTotal);
      }

      let stockStatus = 'in-stock';
      let isAvailable = true;

      if (product.isBlocked) {
        stockStatus = 'blocked';
        isAvailable = false;
        hasUnavailableItems = true;
      } else if (product.quantity <= 0) {
        stockStatus = 'out-of-stock';
        isAvailable = false;
        hasUnavailableItems = true;
      } else if (product.quantity < cartItem.quantity) {
        stockStatus = 'low-stock';
        isAvailable = false;
        hasUnavailableItems = true;
      }

      return {
        ...cartItem.toObject(),
        itemPrice,
        itemTotal,
        originalPrice: product.regularPrice || product.salePrice,
        hasOffer: productWithOffer.hasOffer,
        discountPercentage: productWithOffer.discountPercentage,
        isFree: productWithOffer.hasOffer && productWithOffer.discountPercentage >= 100,
        stockStatus,
        isAvailable
      };
    }));

    const shippingCharge = 0;

    // Coupon discount
    let discount = 0;
    if (req.session.appliedCoupon) {
      const coupon = await Coupon.findOne({
        couponCode: req.session.appliedCoupon.code,
        status: true,
        expiry: { $gte: new Date() }
      });

      if (coupon) {
        if (coupon.type === 'percentageDiscount') {
          discount = Math.floor((subtotal * coupon.discount) / 100);
        } else if (coupon.type === 'flatDiscount') {
          discount = coupon.discount;
        }
      } else {
        delete req.session.appliedCoupon;
      }
    }

    const totalAmount = subtotal + shippingCharge - discount;
    const userData = await User.findById(userId);

    res.render('user/checkout', {
      title: 'Checkout - Artimes',
      user: userData,
      addresses,
      cartItems,
      subtotal,
      shippingCharge,
      discount,
      totalAmount,
      totalItems,
      totalProductSavings,
      appliedCoupon: req.session.appliedCoupon || null,
      hasUnavailableItems
    });

  } catch (error) {
    console.error('Error loading checkout page:', error);
    res.status(500).render('user/error', {
      message: 'Something went wrong while loading checkout page',
      error: error.message
    });
  }
};

// Place Order - Updated for Razorpay flow
const placeOrder = async (req, res) => {
  try {
    const userId = req.session.user?._id;
    const { addressId, paymentMethod, couponApplied } = req.body;

    if (!userId) return res.status(401).json({ success: false, error: "Unauthorized user" });

    // Get user cart
    const cart = await Cart.findOne({ userId }).populate({
      path: "items.productId",
      populate: { path: "category", select: "isListed" }
    });
    
    if (!cart || cart.items.length === 0) return res.status(400).json({ success: false, error: "Cart is empty" });

    // Get selected address
    const userAddress = await Address.findOne({ userId });
    if (!userAddress) return res.status(404).json({ success: false, error: "Address not found" });

    const selectedAddress = userAddress.address.find(
      (addr) => addr._id.toString() === addressId
    );
    if (!selectedAddress) return res.status(404).json({ success: false, error: "Selected address not found" });

    // Calculate total amount with offers
    let orderAmount = 0;
    let subtotal = 0;
    
    // Prepare ordered items with offer prices
    const orderedItem = await Promise.all(cart.items.map(async (item) => {
      const product = item.productId;
      
      // Apply offer to get correct price
      const productWithOffer = await applyOfferToProduct(product);
      
      // Determine price based on offer
      let productPrice;
      if (productWithOffer.hasOffer && productWithOffer.discountPercentage >= 100) {
        productPrice = 0; // Free product
      } else if (productWithOffer.hasOffer) {
        productPrice = productWithOffer.discountedPrice;
      } else {
        productPrice = product.salePrice || product.regularPrice;
      }
      
      const totalProductPrice = productPrice * item.quantity;
      orderAmount += totalProductPrice;
      subtotal += (product.salePrice || product.regularPrice) * item.quantity;
      
      return {
        productId: product._id,
        quantity: item.quantity,
        size: item.size,
        productPrice: productPrice,
        totalProductPrice: totalProductPrice,
        offer_id: productWithOffer.offerId || null,
      };
    }));

    let couponDiscount = 0;
    let couponCode = null;

    if (couponApplied) {
      const coupon = await Coupon.findOne({
        couponCode: couponApplied.toUpperCase(),
        status: true,
      });

      if (coupon) {
        if (coupon.expiry && coupon.expiry < new Date())
          return res.status(400).json({ success: false, error: "Coupon expired" });

        if (orderAmount >= coupon.minPurchase) {
          if (coupon.type === "percentageDiscount") {
            couponDiscount = (orderAmount * coupon.discount) / 100;
          } else if (coupon.type === "flatDiscount") {
            couponDiscount = coupon.discount;
          }

          couponCode = coupon.couponCode;
          orderAmount -= couponDiscount;
        } else {
          return res.status(400).json({
            success: false,
            error: `Minimum purchase of ₹${coupon.minPurchase} required for this coupon.`,
          });
        }
      }
    }

    // Check product stock
    for (const item of cart.items) {
      const product = await Product.findById(item.productId._id);
      if (!product) return res.status(404).json({ success: false, error: "Product not found" });
      if (product.quantity < item.quantity) {
        return res.status(400).json({
          success: false,
          error: `Not enough stock for product ${product.productName}`,
        });
      }
    }

    // Generate order number
    const orderNumber = "ORD-" + Date.now();

    // Set payment status based on payment method
    let paymentStatus = "Pending";
    if (paymentMethod === "COD") {
      paymentStatus = "Pending";
    } else if (paymentMethod === "Wallet") {
      // Check wallet balance
      const wallet = await Wallet.findOne({ userId });
      if (!wallet || wallet.balance < orderAmount) {
        return res.status(400).json({ 
          success: false, 
          error: "Insufficient wallet balance" 
        });
      }
      paymentStatus = "Paid";
    } else if (paymentMethod === "Razorpay") {
      paymentStatus = "Pending"; // Will be updated after payment verification
    }

    // Create order
    const newOrder = new Orders({
      userId,
      cartId: cart._id,
      orderedItem,
      deliveryAddress: userAddress._id,
      orderAmount,
      paymentMethod,
      paymentStatus,
      orderNumber,
      couponDiscount,
      couponCode,
      orderStatus: paymentStatus === "Paid" ? "Confirmed" : "Pending",
    });

    await newOrder.save();

    // Handle immediate payments (Wallet)
    if (paymentMethod === "Wallet") {
      // Update wallet
      const wallet = await Wallet.findOne({ userId });
      if (wallet) {
        wallet.balance -= orderAmount;
        wallet.transaction.push({
          amount: orderAmount,
          transactionsMethod: "Payment",
          orderId: newOrder._id,
          date: new Date(),
        });
        await wallet.save();
      }

      // Deduct stock for wallet payments
      for (const item of cart.items) {
        await Product.findByIdAndUpdate(item.productId._id, {
          $inc: { quantity: -item.quantity },
        });
      }

      // Clear cart
      await Cart.findOneAndDelete({ userId });
    }

    // For COD and Razorpay, don't deduct stock yet - will happen after payment verification
    if (paymentMethod === "COD") {
      // For COD, we still create the order but stock will be deducted when order is confirmed
      await Cart.findOneAndDelete({ userId });
    }

    // Calculate total savings
    const totalSavings = subtotal - orderAmount + couponDiscount;

    res.status(200).json({
      success: true,
      message: "Order placed successfully!",
      orderId: newOrder._id,
      orderNumber,
      paymentMethod,
      requiresPayment: paymentMethod === "Razorpay",
      totalSavings: totalSavings > 0 ? totalSavings : 0
    });
  } catch (error) {
    console.error("Error placing order:", error);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
};

// Create Razorpay Order
const createRazorpayOrder = async (req, res) => {
  try {
    const { amount, orderId } = req.body;
    const userId = req.session.user?._id;

    if (!userId) {
      return res.status(401).json({ success: false, error: "User not authenticated" });
    }

    if (!amount || isNaN(amount) || Number(amount) <= 0) {
      return res.status(400).json({ success: false, error: "Invalid amount" });
    }

    if (!orderId || !mongoose.Types.ObjectId.isValid(orderId)) {
      return res.status(400).json({ success: false, error: "Invalid order ID" });
    }

    // Verify order belongs to user
    const order = await Orders.findOne({ _id: orderId, userId });
    if (!order) {
      return res.status(404).json({ success: false, error: "Order not found" });
    }

    // Verify order is for Razorpay payment
    if (order.paymentMethod !== "Razorpay") {
      return res.status(400).json({ success: false, error: "Invalid payment method for this order" });
    }

    const amountInPaise = Math.round(Number(amount) * 100);
    
    // Validate minimum amount (Razorpay requires at least 1 INR)
    if (amountInPaise < 100) {
      return res.status(400).json({ success: false, error: "Amount too small for payment" });
    }

    const receipt = `rcpt_${order.orderNumber || orderId}`;

    const razorpayOrder = await razorpay.orders.create({
      amount: amountInPaise,
      currency: "INR",
      receipt: receipt,
      payment_capture: 1
    });

    // Update order with Razorpay order ID
    order.razorpayOrderId = razorpayOrder.id;
    await order.save();

    return res.json({
      success: true,
      order: {
        id: razorpayOrder.id,
        amount: razorpayOrder.amount,
        currency: razorpayOrder.currency,
        key_id: process.env.RAZORPAY_KEY_ID
      }
    });

  } catch (error) {
    console.error("Razorpay order creation error:", error);
    return res.status(500).json({
      success: false,
      error: "Failed to create payment order: " + (error.error?.description || error.message)
    });
  }
};

// Verify Payment 
const verifyPayment = async (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, orderId } = req.body;
    const userId = req.session.user?._id;

    console.log('🔍 Payment verification started:', {
      razorpay_order_id,
      razorpay_payment_id,
      orderId,
      userId
    });

    if (!userId) {
      return res.status(401).json({ success: false, message: "User not authenticated" });
    }

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature || !orderId) {
      return res.status(400).json({ success: false, message: "Missing required payment details" });
    }

    // Find the order
    const order = await Orders.findOne({ _id: orderId, userId });
    if (!order) {
      return res.status(404).json({ success: false, message: "Order not found" });
    }

    // Verify signature
    const generatedSignature = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest("hex");

    if (generatedSignature !== razorpay_signature) {
      await Orders.findByIdAndUpdate(orderId, {
        paymentStatus: "Failed",
        orderStatus: "Cancelled"
      });
      return res.status(400).json({ 
        success: false, 
        message: "Payment verification failed" 
      });
    }

    // Verify with Razorpay API
    const payment = await razorpay.payments.fetch(razorpay_payment_id);
    if (payment.status !== 'captured') {
      await Orders.findByIdAndUpdate(orderId, {
        paymentStatus: "Failed",
        orderStatus: "Cancelled"
      });
      return res.status(400).json({ 
        success: false, 
        message: `Payment not captured. Status: ${payment.status}` 
      });
    }

    // Update order with successful payment
    await Orders.findByIdAndUpdate(orderId, {
      paymentStatus: "Paid",
      razorpayOrderId: razorpay_order_id,
      razorpayPaymentId: razorpay_payment_id,
      razorpaySignature: razorpay_signature,
      paymentDate: new Date(),
      orderStatus: "Confirmed"
    });

    // Update product stock
    const updatedOrder = await Orders.findById(orderId);
    for (const item of updatedOrder.orderedItem) {
      await Product.findByIdAndUpdate(
        item.productId, 
        { $inc: { quantity: -item.quantity } }
      );
    }

    // Clear cart and session
    await Cart.deleteOne({ userId });
    if (req.session.appliedCoupon) {
      delete req.session.appliedCoupon;
    }

    res.json({
      success: true,
      message: "Payment verified successfully",
      orderId: order._id
    });

  } catch (error) {
    console.error("Payment verification error:", error);
    
    // Update order status to failed
    if (req.body.orderId) {
      await Orders.findByIdAndUpdate(req.body.orderId, {
        paymentStatus: "Failed",
        orderStatus: "Cancelled"
      });
    }
    
    res.status(500).json({
      success: false,
      message: "Payment verification failed",
      error: error.message
    });
  }
};

// Order success page
const orderSuccessPage = async (req, res, next) => {
  try {
    const orderId = req.params.orderId;
    const userId = req.session.user?._id;

    if (!userId) {
      req.flash('error', 'Please login to view your order');
      return res.redirect("/login");
    }

    // Validate order ID
    if (!orderId || !mongoose.Types.ObjectId.isValid(orderId)) {
      req.flash('error', 'Invalid order ID');
      return res.redirect("/orders");
    }

    // Find order with comprehensive population
    const order = await Orders.findById(orderId)
      .populate("userId", "name email phone")
      .populate({
        path: "orderedItem.productId",
        select: "productName images salePrice regularPrice discount color size description"
      })
      .lean();

    if (!order) {
      req.flash('error', 'Order not found');
      return res.redirect("/orders");
    }

    // Security: ensure order belongs to logged-in user
    if (order.userId._id.toString() !== userId.toString()) {
      req.flash('error', 'Unauthorized access to this order');
      return res.redirect("/orders");
    }

    // Only show success page for successful orders
    if (order.paymentStatus !== "Paid" && order.paymentMethod !== "COD") {
      req.flash('error', 'Payment not completed for this order');
      return res.redirect(`/order/${orderId}/details`);
    }

    // Get shipping address
    const addressDoc = await Address.findById(order.deliveryAddress).lean();
    const shippingAddress = addressDoc?.address?.[0] || null;

    const userData = await User.findById(userId)

    // Calculate order summary with offer savings
    const subtotal = order.orderedItem.reduce((sum, item) => {
      const originalPrice = item.productId?.regularPrice || item.productPrice;
      return sum + (originalPrice * item.quantity);
    }, 0);
    
    const totalWithOffers = order.orderAmount + (order.couponDiscount || 0);
    const offerSavings = subtotal - totalWithOffers;

    const orderSummary = {
      subtotal: subtotal,
      discount: order.couponDiscount || 0,
      offerSavings: offerSavings > 0 ? offerSavings : 0,
      shipping: order.shippingCharge || 0,
      total: order.orderAmount
    };

    // Format order data for display
    const formattedOrder = {
      ...order,
      displayOrderId: order.orderNumber || `ORD-${order._id.toString().slice(-8).toUpperCase()}`,
      formattedDate: new Date(order.createdAt).toLocaleDateString('en-IN', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      }),
      estimatedDelivery: order.deliveryDate ? 
        new Date(order.deliveryDate).toLocaleDateString('en-IN') : 
        new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toLocaleDateString('en-IN'),
      shippingAddress: shippingAddress
    };

    // Process product images for proper display
    if (order.orderedItem && order.orderedItem.length > 0) {
      order.orderedItem.forEach(item => {
        if (item.productId && item.productId.images && item.productId.images.length > 0) {
          // Ensure images have proper paths
          item.productId.images = item.productId.images.map(img => {
            if (img.startsWith('http') || img.startsWith('/')) {
              return img;
            }
            return `/uploads/productsImages/${img}`;
          });
        }
        
        // Check if item was free (100% off)
        item.isFree = item.productPrice === 0;
      });
    }

    res.render("user/orderSuccess", {
      title: `Order Confirmed - ${formattedOrder.displayOrderId}`,
      order: formattedOrder,
      orderSummary,
      user: userData,
      success: true,
      
      // Backward compatibility with old template variables
      orderNumber: formattedOrder.displayOrderId,
      email: userData.email,
      orderAmount: order.orderAmount,
      orderedItems: order.orderedItem,
      deliveryAddress: shippingAddress,
      paymentMethod: order.paymentMethod,
      paymentStatus: order.paymentStatus,
      estimatedDelivery: formattedOrder.estimatedDelivery
    });

  } catch (err) {
    console.error("Error rendering order success page:", err);
    
    // Different error handling based on error type
    if (err.name === 'CastError') {
      req.flash('error', 'Invalid order format');
      return res.redirect("/orders");
    }
    
    req.flash('error', 'Something went wrong while loading the order details');
    res.redirect("/orders");
  }
};

// Update Payment Failed
const updatePaymentFailed = async (req, res) => {
  try {
    const { orderId, error: errorMessage } = req.body;
    const userId = req.session.user?._id;

    if (!userId) {
      return res.status(401).json({ success: false, error: 'User not authenticated' });
    }

    if (!orderId || !mongoose.Types.ObjectId.isValid(orderId)) {
      return res.status(400).json({ success: false, error: 'Invalid or missing order ID' });
    }

    // Update order payment status
    const order = await Orders.findOneAndUpdate(
      { _id: orderId, userId },
      { 
        paymentStatus: 'Failed', 
        orderStatus: 'Cancelled',
        $unset: { 
          razorpayOrderId: 1,
          razorpayPaymentId: 1,
          razorpaySignature: 1 
        }
      },
      { new: true }
    );

    if (!order) {
      return res.status(404).json({ success: false, error: 'Order not found or unauthorized' });
    }

    console.log(`Payment failed for order: ${orderId}, Error: ${errorMessage || 'Unknown error'}`);

    res.json({
      success: true,
      message: 'Payment status updated to failed',
      orderId: order._id,
      paymentMethod: order.paymentMethod || 'N/A'
    });

  } catch (err) {
    console.error('Error updating payment failed status:', err);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

// Render Payment Failure Page
const renderPaymentFailure = async (req, res) => {
  try {
    const orderId = req.params.orderId;
    const errorMessage = req.query.error || null;
    const userId = req.session.user?._id;

    if (!userId) {
      req.flash('error', 'Please login first');
      return res.redirect('/login');
    }

    const order = await Orders.findOne({ _id: orderId, userId }).lean();
    if (!order) {
      req.flash('error', 'Order not found');
      return res.redirect('/orders');
    }

    const user = await User.findById(userId).lean();

    res.render('user/orderFailure', {
      orderId: order._id,
      orderAmount: order.orderAmount || 0,
      paymentMethod: order.paymentMethod || "N/A",
      paymentStatus: order.paymentStatus || "Failed",
      email: user?.email || 'N/A',
      userName: user?.name || 'Customer',
      userPhone: user?.phone || '',
      razorpayKeyId: process.env.RAZORPAY_KEY_ID,
      errorMessage: errorMessage,
      user: user || {}
    });

  } catch (error) {
    console.error('Error rendering payment failure page:', error);
    req.flash('error', 'Something went wrong');
    res.redirect('/orders');
  }
};

const orderFailure = async (req, res) => {
  try {
    const orderId = req.params.orderId;
    const errorMessage = req.query.error || null;
    const userId = req.session.user?._id;

    if (!userId) return res.redirect("/login");

    const order = await Orders.findById(orderId).lean();
    if (!order) return res.redirect("/orders");

    const userEmail = req.session.user?.email || "N/A";
    const userName = req.session.user?.name || "Customer";
    const userPhone = req.session.user?.phone || "";

    res.render("user/orderFailure", {
      orderId: order._id,
      orderAmount: order.orderAmount || order.totalPrice || order.finalAmount || 0,
      paymentMethod: order.paymentMethod || "N/A",
      paymentStatus: order.paymentStatus || "Failed",
      email: userEmail,
      userName: userName,
      userPhone: userPhone,
      razorpayKeyId: process.env.RAZORPAY_KEY_ID,
      errorMessage: errorMessage
    });

  } catch (error) {
    console.error("Error rendering payment failure page:", error);
    res.redirect("/orders");
  }
};


const loadOrdersPage = async (req, res) => {
  let userData = null;

  try {
    const userId = req.session.user?._id;
    if (!userId) return res.redirect("/login");

    userData = await User.findById(userId);

    // Fetch all orders for the user, populate products and delivery address
    const orders = await Orders.find({ userId })
      .populate("orderedItem.productId")
      .populate("deliveryAddress")
      .sort({ createdAt: -1 })
      .lean();

    // Calculate savings for each order
    const ordersWithSavings = orders.map(order => {
      let subtotal = 0;
      order.orderedItem.forEach(item => {
        const originalPrice = item.productId?.regularPrice || item.productPrice;
        subtotal += originalPrice * item.quantity;
      });
      
      return {
        ...order,
        subtotal,
        totalSavings: subtotal - order.orderAmount
      };
    });

    res.render("user/orderList", {
      user: userData,
      orders: ordersWithSavings,
      title: "My Orders",
    });
  } catch (error) {
    console.error("Error rendering user orders page:", error);
    res.status(500).render("error", {
      message: "Failed to load orders page",
      user: userData,
    });
  }
};


// Get user's orders with search and pagination
const getUserOrders = async (req, res) => {
  try {
    const userId = req.session.user?._id;
    if (!userId) {
      return res.json({ success: false, message: "User not authenticated" });
    }

    const { page = 1, limit = 10, search } = req.query;
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    let filter = { userId };

    if (search && search.trim()) {
      const searchTerm = search.trim();
      const searchRegex = { $regex: searchTerm, $options: "i" };

      const orderNumberFilter = { orderNumber: searchRegex };

      const matchingProducts = await Product.find({
        $or: [{ productName: searchRegex }, { description: searchRegex }],
      }).select("_id");

      const productIds = matchingProducts.map((p) => p._id);

      if (productIds.length > 0) {
        filter = {
          ...filter,
          $or: [
            orderNumberFilter,
            { "orderedItem.productId": { $in: productIds } },
          ],
        };
      } else {
        filter = { ...filter, ...orderNumberFilter };
      }
    }

    const [totalOrders, orders] = await Promise.all([
      Orders.countDocuments(filter),
      Orders.find(filter)
        .populate({
          path: "orderedItem.productId",
          select:
            "productName images salePrice regularPrice discount description",
        })
        .populate({
          path: "deliveryAddress",
          select: "name email number houseName street city state country pincode saveAs",
        })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .lean(),
    ]);

    const totalPages = Math.ceil(totalOrders / limitNum);

    const formattedOrders = orders.map((order) => {
      let subtotal = 0;
      order.orderedItem?.forEach(item => {
        const originalPrice = item.productId?.regularPrice || item.productPrice;
        subtotal += originalPrice * item.quantity;
      });
      
      return {
        ...order,
        displayOrderId: order.orderNumber
          ? order.orderNumber.slice(0, 8).toUpperCase()
          : order._id.toString().slice(-8).toUpperCase(),
        formattedDate: new Date(order.createdAt).toLocaleString("en-IN"),
        subtotal,
        finalAmount: order.orderAmount || 0,
        totalSavings: subtotal - order.orderAmount
      };
    });

    res.json({
      success: true,
      orders: formattedOrders,
      currentPage: pageNum,
      totalPages,
      totalOrders,
    });
  } catch (error) {
    console.error("Error fetching user orders:", error);
    res.json({
      success: false,
      message: "Failed to fetch orders",
      error: error.message,
    });
  }
};

// Get single order details
const getUserOrderDetails = async (req, res) => {
  try {
    const { orderId } = req.params;
    const userId = req.session.user?._id;

    if (!userId) return res.redirect("/login");

    const userData = await User.findById(userId).lean();

    if (!mongoose.Types.ObjectId.isValid(orderId)) {
      return res.status(400).render("error", {
        message: "Invalid order ID format.",
        user: userData,
      });
    }

    const order = await Orders.findOne({ _id: orderId, userId })
      .populate({
        path: "orderedItem.productId",
        select:
          "productName images salePrice regularPrice discount description quantity",
      })
      .lean();

    if (!order) {
      return res.status(404).render("error", {
        message: "Order not found.",
        user: userData,
      });
    }

    // Get shipping address
    const addressDoc = await Address.findById(order.deliveryAddress).lean();
    const shippingAddress = addressDoc?.address?.[0] || null;

    if (order.orderedItem?.length) {
      order.orderedItem.forEach((item) => {
        const product = item.productId;
        if (product?.images?.length) {
          product.images = product.images.map((img) =>
            img && !img.startsWith("/uploads/productsImages/")
              ? `/uploads/productsImages/${img}`
              : img
          );
        }
        
        // Check if item was free
        item.isFree = item.productPrice === 0;
      });
    }

    let subtotal = 0;
    order.orderedItem?.forEach(item => {
      const originalPrice = item.productId?.regularPrice || item.productPrice;
      subtotal += originalPrice * item.quantity;
    });

    const orderData = {
      ...order,
      displayOrderId: order.orderNumber
        ? order.orderNumber.slice(0, 8).toUpperCase()
        : order._id.toString().slice(-8).toUpperCase(),
      formattedDate: new Date(order.createdAt).toLocaleString("en-IN"),
      subtotal,
      shippingAddress,
      finalAmount: order.orderAmount || subtotal,
      totalSavings: subtotal - order.orderAmount
    };

    res.render("user/orderDetails", {
      order: orderData,
      user: userData,
      title: `Order ${orderData.displayOrderId}`,
    });
  } catch (error) {
    console.error("Error fetching order details:", error);

    const userId = req.session.user?._id;
    const userData = userId ? await User.findById(userId).lean() : null;

    res.status(500).render("error", {
      message: "Failed to load order details. Please try again.",
      user: userData,
    });
  }
};


// Cancel entire order
const cancelOrder = async (req, res) => {
  try {
    const { orderId } = req.params;
    const userId = req.session.user?._id;

    if (!userId) {
      return res.status(401).json({ success: false, message: "User not authenticated" });
    }

    const order = await Orders.findOne({ _id: orderId, userId })
      .populate("orderedItem.productId");

    if (!order) {
      return res.status(404).json({ success: false, message: "Order not found" });
    }

    // Check if order can be cancelled
    const nonCancellableStatuses = ["Shipped", "Delivered", "Cancelled"];
    if (nonCancellableStatuses.includes(order.orderStatus)) {
      return res.status(400).json({
        success: false,
        message: `Order cannot be cancelled as it's already ${order.orderStatus}`,
      });
    }

    // Restore stock for all products in order
    for (const item of order.orderedItem) {
      if (item.productId) {
        const quantity = Number(item.quantity);
        await Product.findByIdAndUpdate(item.productId._id, {
          $inc: { quantity },
        });
      }
    }

    // Calculate refund amount (full order amount)
    let totalRefundAmount = order.orderAmount;

    // Refund to wallet if payment was made
    if (order.paymentStatus === "Paid" && totalRefundAmount > 0) {
      let wallet = await Wallet.findOne({ userId });
      if (!wallet) wallet = new Wallet({ userId, balance: 0, transaction: [] });

      await Wallet.updateOne(
        { userId },
        {
          $inc: { balance: totalRefundAmount },
          $push: {
            transaction: {
              amount: totalRefundAmount,
              transactionsMethod: "Refund",
              orderId: order._id,
              date: new Date(),
              description: `Refund for cancelled order: ${order.orderNumber || order._id}`,
            },
          },
        }
      );
    }

    // Update order status
    order.orderStatus = "Cancelled";
    order.paymentStatus = order.paymentStatus === "Paid" ? "Refunded" : "Failed";
    await order.save();

    res.json({
      success: true,
      message: "Order cancelled successfully",
      refundAmount: totalRefundAmount,
      refundedToWallet: order.paymentStatus === "Refunded",
      data: {
        orderId: order._id,
        cancelledAt: new Date(),
      },
    });
  } catch (error) {
    console.error("Error cancelling order:", error);
    res.status(500).json({
      success: false,
      message: "Failed to cancel order",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

// Cancel individual item
const cancelItem = async (req, res) => {
  try {
    const { orderId, productId, itemIndex } = req.body;
    const userId = req.session.user?._id;

    if (!userId)
      return res.status(401).json({ success: false, message: "User not authenticated" });

    const order = await Orders.findOne({ _id: orderId, userId })
      .populate("orderedItem.productId");
    if (!order)
      return res.status(404).json({ success: false, message: "Order not found" });

    const index = parseInt(itemIndex);
    if (isNaN(index) || index < 0 || index >= order.orderedItem.length)
      return res.status(400).json({ success: false, message: "Invalid item index" });

    const item = order.orderedItem[index];
    if (!item || item.productId?._id.toString() !== productId)
      return res.status(400).json({ success: false, message: "Product ID mismatch" });

    // Check if order can have items cancelled
    if (["Delivered", "Cancelled", "Returned"].includes(order.orderStatus)) {
      return res.status(400).json({
        success: false,
        message: `Items cannot be cancelled because order is ${order.orderStatus}`,
      });
    }

    // Restore product stock
    const quantity = Number(item.quantity);
    await Product.findByIdAndUpdate(productId, {
      $inc: { quantity },
    });

    // --- Refund calculation ---
    let refundAmount = item.totalProductPrice;
    if (order.couponDiscount > 0) {
      const originalSubtotal = order.orderedItem.reduce(
        (sum, orderItem) => sum + orderItem.totalProductPrice,
        0
      );
      const proportionalDiscount = Math.round(
        (item.totalProductPrice / originalSubtotal) * order.couponDiscount
      );
      refundAmount -= proportionalDiscount;
    }

    // --- Refund to wallet if paid ---
    if (order.paymentStatus === "Paid") {
      let wallet = await Wallet.findOne({ userId });
      if (!wallet) {
        wallet = new Wallet({ userId, balance: 0, transaction: [] });
        await wallet.save();
      }

      await Wallet.updateOne(
        { userId },
        {
          $inc: { balance: refundAmount },
          $push: {
            transaction: {
              amount: refundAmount,
              transactionsMethod: "Refund",
              orderId: order._id,
              date: new Date(),
              description: `Refund for cancelled item: ${item.productId?.productName || "Unknown product"}`,
            },
          },
        }
      );
    }

    // --- Remove item from order ---
    order.orderedItem.splice(index, 1);

    // Recalculate order amount
    order.orderAmount = order.orderedItem.reduce(
      (sum, i) => sum + i.totalProductPrice, 0
    );

    // Update order-level status
    if (order.orderedItem.length === 0) {
      order.orderStatus = "Cancelled";
      order.paymentStatus = order.paymentStatus === "Paid" ? "Refunded" : "Failed";
    }

    await order.save();

    return res.json({
      success: true,
      message: "Item cancelled successfully",
      data: {
        orderId: order._id,
        refundAmount,
      },
    });
  } catch (error) {
    console.error("Error cancelling item:", error);
    res.status(500).json({
      success: false,
      message: "Failed to cancel item",
      error: error.message,
    });
  }
};


// Return individual item
const returnItem = async (req, res) => {
  try {
    const { orderId, productId, itemIndex, returnReason } = req.body;
    const userId = req.session.user?._id;

    if (!userId)
      return res.status(401).json({ success: false, message: "User not authenticated" });

    const order = await Orders.findOne({ _id: orderId, userId }).populate("orderedItem.productId");
    if (!order)
      return res.status(404).json({ success: false, message: "Order not found" });

    const index = parseInt(itemIndex);
    if (isNaN(index) || index < 0 || index >= order.orderedItem.length)
      return res.status(400).json({ success: false, message: "Invalid item index" });

    const item = order.orderedItem[index];
    if (!item || item.productId?._id.toString() !== productId)
      return res.status(404).json({ success: false, message: "Item not found in order" });

    if (order.orderStatus !== "Delivered")
      return res.status(400).json({ success: false, message: "Only delivered orders can be returned" });

    // Update order for return request
    order.returnReason = returnReason || "No reason specified";
    order.returnStatus = "Requested";
    order.returnRequestDate = new Date();
    order.orderStatus = "Return Requested";

    await order.save();

    return res.status(200).json({
      success: true,
      message: "Return request submitted successfully",
      data: {
        orderId: order._id,
        returnReason: order.returnReason,
        returnRequestDate: order.returnRequestDate,
      },
    });
  } catch (error) {
    console.error("Error submitting return request:", error);
    res.status(500).json({
      success: false,
      message: "Failed to submit return request",
      error: error.message,
    });
  }
};


// Generate invoice PDF
const generateInvoice = async (req, res) => {
  try {
    const { orderId } = req.params;
    const userId = req.session.user?._id;

    if (!userId)
      return res.status(401).json({ success: false, message: "User not authenticated" });

    if (!mongoose.Types.ObjectId.isValid(orderId))
      return res.status(400).json({ success: false, message: "Invalid order ID format" });

    const order = await Orders.findOne({ _id: orderId, userId })
      .populate({
        path: "orderedItem.productId",
        select: "productName images salePrice regularPrice",
      })
      .populate({
        path: "deliveryAddress",
        select: "firstName lastName street city state zipCode phone",
      })
      .populate({ path: "userId", select: "name email" })
      .lean();

    if (!order)
      return res.status(404).json({ success: false, message: "Order not found" });

    // Invoice file name
    const invoiceFileName = `invoice-${(order.orderId || order._id.toString().slice(-8)).toUpperCase()}.pdf`;

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename=${invoiceFileName}`);

    const doc = new PDFDocument({ margin: 50 });
    doc.pipe(res);

    try {
      addInvoiceContent(doc, {
        ...order,
        orderId: order.orderId || order._id.toString().slice(-8).toUpperCase(),
        userEmail: order.userId?.email || "N/A",
        userName: order.userId?.name || "Customer",
        deliveryAddress: order.deliveryAddress || {},
      });
    } catch (contentError) {
      console.error("Error while rendering invoice content:", contentError);
      doc.text("Error generating invoice content. Please contact support.", { align: "center" });
    }

    doc.end();
  } catch (error) {
    console.error("Error generating invoice:", error);
    res.status(500).json({
      success: false,
      message: "Failed to generate invoice",
      error: error.message,
    });
  }
};

// Invoice content
const addInvoiceContent = (doc, order) => {
  const orderItems = order.orderedItem || [];
  const subtotal = orderItems.reduce((sum, item) => {
    const originalPrice = item.productId?.regularPrice || item.productPrice;
    return sum + (originalPrice * item.quantity);
  }, 0);
  
  const discount = order.couponDiscount || 0;
  const offerSavings = subtotal - (order.orderAmount + discount);
  const shippingCharge = order.shippingCharge || 0;
  const orderDate = new Date(order.createdAt || Date.now()).toLocaleDateString("en-IN");

  // Header
  doc.fontSize(20).font("Helvetica-Bold").fillColor("#e74c3c").text("ALLSCOUTS", 50, 50);
  doc.fontSize(16).fillColor("#000000").text("INVOICE", 50, 80);
  doc.fontSize(10).font("Helvetica")
    .text(`Order #: ${order.orderId || order._id}`, 50, 120)
    .text(`Date: ${orderDate}`, 50, 135);

  // Billing Info
  doc.fontSize(12).font("Helvetica-Bold").text("Billing Information:", 50, 170);
  doc.fontSize(10).font("Helvetica")
    .text(`Customer: ${order.userId?.name || "N/A"}`, 50, 190)
    .text(`Email: ${order.userId?.email || "N/A"}`, 50, 205)
    .text(`Payment Method: ${order.paymentMethod || "N/A"}`, 50, 220)
    .text(`Payment Status: ${order.paymentStatus || "N/A"}`, 50, 235);

  // Shipping Info
  doc.fontSize(12).font("Helvetica-Bold").text("Shipping Information:", 300, 170);
  const shippingAddress = order.deliveryAddress || {};
  if (Object.keys(shippingAddress).length > 0) {
    doc.fontSize(10).font("Helvetica")
      .text(`Name: ${shippingAddress.firstName || ""} ${shippingAddress.lastName || ""}`, 300, 190)
      .text(`Phone: ${shippingAddress.phone || "N/A"}`, 300, 205)
      .text(`Address: ${shippingAddress.houseName || ""} ${shippingAddress.street || ""}`, 300, 220)
      .text(`${shippingAddress.city || ""}, ${shippingAddress.state || ""} - ${shippingAddress.zipCode || ""}`, 300, 235)
      .text(`Country: India`, 300, 250);
  } else {
    doc.fontSize(10).font("Helvetica").text("Shipping address not available", 300, 190);
  }

  // Table Header
  doc.fontSize(11).font("Helvetica-Bold").fillColor("#ffffff").rect(50, 300, 500, 20).fill("#e74c3c");
  doc.fillColor("#ffffff").text("Product", 60, 305)
    .text("Size", 200, 305)
    .text("Qty", 280, 305)
    .text("Unit Price", 320, 305)
    .text("Total", 400, 305);

  // Table Rows
  let yPosition = 330;
  doc.fillColor("#000000");
  orderItems.forEach((item) => {
    if (yPosition > 700) { doc.addPage(); yPosition = 50; }
    const product = item.productId || {};
    const isFree = item.productPrice === 0;
    
    doc.fontSize(9).font("Helvetica")
      .text(product.productName || "Product not found", 60, yPosition)
      .text(item.size || "N/A", 200, yPosition)
      .text(item.quantity || 0, 280, yPosition)
      .text(isFree ? "FREE" : `₹${(item.productPrice || 0).toFixed(2)}`, 320, yPosition)
      .text(isFree ? "FREE" : `₹${(item.totalProductPrice || 0).toFixed(2)}`, 400, yPosition);
    yPosition += 20;
  });

  // Totals
  const totalsY = yPosition + 40;
  doc.fontSize(11).font("Helvetica-Bold")
    .text("Subtotal:", 350, totalsY).text(`₹${subtotal.toFixed(2)}`, 450, totalsY);
  
  if (offerSavings > 0) {
    doc.text("Offer Savings:", 350, totalsY + 20).text(`-₹${offerSavings.toFixed(2)}`, 450, totalsY + 20);
  }
  
  if (discount > 0) {
    const yOffset = offerSavings > 0 ? 40 : 20;
    doc.text("Coupon Discount:", 350, totalsY + yOffset).text(`-₹${discount.toFixed(2)}`, 450, totalsY + yOffset);
  }
  
  doc.text("Shipping:", 350, totalsY + 60).text(`₹${shippingCharge.toFixed(2)}`, 450, totalsY + 60);
  
  const grandTotal = order.orderAmount || (subtotal - offerSavings - discount + shippingCharge);
  doc.fontSize(14).text("Grand Total:", 350, totalsY + 90).text(`₹${grandTotal.toFixed(2)}`, 450, totalsY + 90);

  doc.fontSize(8).font("Helvetica")
    .text("Thank you for your business!", 50, totalsY + 130)
    .text("This is a computer-generated invoice. No signature required.", 50, totalsY + 145);
};

// Apply Coupon
const applyCoupon = async (req, res) => {
  try {
    const { code } = req.body;
    const userId = req.session.user?._id;

    if (!userId) {
      return res.status(401).json({ success: false, message: 'User not logged in' });
    }

    if (!code) {
      return res.status(400).json({ success: false, message: 'Coupon code is required' });
    }

    // Find the coupon
    const coupon = await Coupon.findOne({
      couponCode: code.toUpperCase(),
      status: true,
      expiry: { $gte: new Date() },
      maxRedeem: { $gt: 0 }
    });

    if (!coupon) {
      return res.status(400).json({ success: false, message: 'Invalid or expired coupon' });
    }

    // Fetch cart to validate minimum purchase
    const cart = await Cart.findOne({ userId }).populate({
      path: 'items.productId',
      select: 'regularPrice'
    });

    if (!cart || !cart.items || cart.items.length === 0) {
      return res.status(400).json({ success: false, message: 'Cart is empty' });
    }

    // Calculate subtotal with offers
    let subtotal = 0;
    await Promise.all(cart.items.map(async (cartItem) => {
      const productWithOffer = await applyOfferToProduct(cartItem.productId);
      let itemPrice;
      if (productWithOffer.hasOffer && productWithOffer.discountPercentage >= 100) {
        itemPrice = 0;
      } else if (productWithOffer.hasOffer) {
        itemPrice = productWithOffer.discountedPrice;
      } else {
        itemPrice = cartItem.productId.salePrice || cartItem.productId.regularPrice;
      }
      subtotal += itemPrice * cartItem.quantity;
    }));

    // Check minimum purchase requirement
    if (subtotal < coupon.minPurchase) {
      return res.status(400).json({
        success: false,
        message: `Minimum purchase of ₹${coupon.minPurchase} required for this coupon`
      });
    }

    // Store coupon in session
    req.session.appliedCoupon = {
      code: coupon.couponCode,
      type: coupon.type,
      discount: coupon.discount,
      minPurchase: coupon.minPurchase,
      description: coupon.description
    };

    // Decrement maxRedeem count
    await Coupon.updateOne(
      { _id: coupon._id },
      { $inc: { maxRedeem: -1 } }
    );

    res.json({ success: true, message: 'Coupon applied successfully' });
  } catch (error) {
    console.error('Error applying coupon:', error);
    res.status(500).json({ success: false, message: 'Server error while applying coupon' });
  }
};

// Remove Coupon
const removeCoupon = async (req, res) => {
  try {
    const userId = req.session.user?._id;

    if (!userId) {
      return res.status(401).json({ success: false, message: 'User not logged in' });
    }

    if (!req.session.appliedCoupon) {
      return res.status(400).json({ success: false, message: 'No coupon applied' });
    }

    // Get the coupon to increment maxRedeem back
    const coupon = await Coupon.findOne({
      couponCode: req.session.appliedCoupon.code,
      status: true
    });

    if (coupon) {
      await Coupon.updateOne(
        { _id: coupon._id },
        { $inc: { maxRedeem: 1 } }
      );
    }

    // Remove coupon from session
    delete req.session.appliedCoupon;

    res.json({ success: true, message: 'Coupon removed successfully' });
  } catch (error) {
    console.error('Error removing coupon:', error);
    res.status(500).json({ success: false, message: 'Server error while removing coupon' });
  }
};

module.exports = {
    applyCoupon,
    removeCoupon,
    getCheckoutPage,
    addAddress,
    placeOrder,
    orderSuccessPage,
    loadOrdersPage,
    getUserOrders,
    getUserOrderDetails,
    cancelOrder,
    cancelItem,
    returnItem,
    generateInvoice,
    createRazorpayOrder,
    verifyPayment,
    orderFailure,
    renderPaymentFailure,
    updatePaymentFailed
}