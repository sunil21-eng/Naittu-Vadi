const Product = require("../../models/productSchema");
const Cart = require("../../models/cartSchema");
const User = require("../../models/userSchema");
const Offer = require("../../models/offerSchema");

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

const loadCart = async (req, res) => {
  try {
    const user = req.session.user;
    if (!user) {
      return res.render("user/login");
    }

    console.log("Loading cart page for user:", user._id);

    const cart = await Cart.findOne({ userId: user._id })
      .populate({
        path: "items.productId",
        populate: { 
          path: "category", 
          select: "name isListed"
        },
        select: "productName images salePrice regularPrice discount isBlocked category categoryAttribute size color quantity"
      });

    // If cart is empty or has no items
    if (!cart || !cart.items.length) {
      const userData = await User.findById(user._id);
      return res.render("user/cart", { user: userData, cart: null });
    }

    // Apply offers to each product and calculate prices
    for (let item of cart.items) {
      const product = item.productId;
      if (!product) continue;

      // Apply offer to product
      const productWithOffer = await applyOfferToProduct(product);
      
      const availableQty = product.quantity ?? 0;
      const requestedQty = item.quantity ?? 0;

      const isBlocked =
        product.isBlocked ||
        !product.category?.isListed ||
        product.status === "blocked" ||
        product.status === "inactive";

      const isOutOfStock = availableQty < requestedQty;

      item.availableStock = availableQty;
      item.isBlocked = Boolean(isBlocked);
      item.isOutOfStock = Boolean(isOutOfStock);
      item.inStock = !isBlocked && !isOutOfStock;
      
      // Set price based on offer
      let unitPrice;
      if (productWithOffer.hasOffer && productWithOffer.discountPercentage >= 100) {
        unitPrice = 0; // Free product
        item.isFree = true;
      } else if (productWithOffer.hasOffer) {
        unitPrice = productWithOffer.discountedPrice;
      } else {
        unitPrice = Number(product.salePrice ?? product.regularPrice ?? 0);
      }
      
      item.price = unitPrice;
      item.total = unitPrice * requestedQty;
      item.originalPrice = productWithOffer.originalPrice || product.regularPrice;
      item.discountPercentage = productWithOffer.discountPercentage;
      item.hasOffer = productWithOffer.hasOffer;
      item.isFree = productWithOffer.hasOffer && productWithOffer.discountPercentage >= 100;
    }

    // Update cart summary
    cart.cartTotal = cart.items.reduce((sum, it) => sum + (it.total || 0), 0);
    cart.hasBlockedItems = cart.items.some(it => it.isBlocked);
    cart.hasOutOfStockItems = cart.items.some(it => it.isOutOfStock);

    // Calculate total savings
    cart.totalSavings = cart.items.reduce((sum, item) => {
      if (item.hasOffer && item.originalPrice) {
        const savings = (item.originalPrice * item.quantity) - item.total;
        return sum + (savings > 0 ? savings : 0);
      }
      return sum;
    }, 0);

    await cart.save();

    // Fetch user details and render page
    const userData = await User.findById(user._id);
    return res.render("user/cart", { user: userData, cart });

  } catch (error) {
    console.error("Error loading cart:", error);
    return res.status(500).send("Server Error");
  }
};

const addToCart = async (req, res) => {
  try {
    const userId = req.session.user?._id;
    const { productId } = req.body;
    const { quantity = 1 } = req.body;

    if (!userId) return res.status(401).json({ success: false, message: "Please login first" });
    if (!productId) return res.status(400).json({ success: false, message: "Product ID is required" });

    const qty = parseInt(quantity, 10);
    if (isNaN(qty) || qty < 1) return res.status(400).json({ success: false, message: "Invalid quantity" });

    const product = await Product.findById(productId)
      .populate("category", "isListed")
      .select("productName regularPrice salePrice category quantity size isBlocked");

    if (!product || product.isBlocked || !product.category?.isListed) {
      return res.status(400).json({ success: false, message: "Product unavailable" });
    }

    const productWithOffer = await applyOfferToProduct(product);
    
    const MAX_QTY = 5;
    let cart = await Cart.findOne({ userId });
    if (!cart) cart = new Cart({ userId, items: [], cartTotal: 0 });

    const existingItem = cart.items.find(i => i.productId.toString() === productId);
    const currentQty = existingItem ? existingItem.quantity : 0;
    const totalQty = currentQty + qty;

    if (totalQty > MAX_QTY) return res.status(400).json({
      success: false,
      message: `You can only add up to ${MAX_QTY} units. Already in cart: ${currentQty}`
    });

    if (totalQty > product.quantity) return res.status(400).json({
      success: false,
      message: `Only ${product.quantity} units available in stock`
    });

    let price;
    if (productWithOffer.hasOffer && productWithOffer.discountPercentage >= 100) {
      price = 0;
    } else if (productWithOffer.hasOffer) {
      price = productWithOffer.discountedPrice;
    } else {
      price = product.salePrice ?? product.regularPrice;
    }

    if (existingItem) {
      existingItem.quantity = totalQty;
      existingItem.price = price;
      existingItem.total = totalQty * price;
    } else {
      cart.items.push({ 
        productId, 
        size: product.size, 
        quantity: qty, 
        price, 
        total: qty * price, 
        stock: product.quantity,
        originalPrice: productWithOffer.originalPrice || product.regularPrice,
        discountPercentage: productWithOffer.discountPercentage,
        hasOffer: productWithOffer.hasOffer
      });
    }

    cart.cartTotal = cart.items.reduce((sum, i) => sum + i.total, 0);
    await cart.save();
    
    const cartCount = cart.items.reduce((total, item) => total + item.quantity, 0);
    req.session.cartCount = cartCount;

    // Remove from wishlist if present
    const user = await User.findById(userId);
    if (user?.wishlist?.length) {
      user.wishlist = user.wishlist.filter(item => item.productId.toString() !== productId);
      await user.save();
    }

    // Get updated wishlist count
    const wishlistCount = user.wishlist.length;
    req.session.wishlistCount = wishlistCount;

    // Return complete cart data for sync
    const cartData = {
      items: cart.items.map(item => ({
        _id: item._id,
        productId: item.productId,
        quantity: item.quantity,
        price: item.price,
        total: item.total,
        originalPrice: item.originalPrice,
        discountPercentage: item.discountPercentage,
        hasOffer: item.hasOffer,
        isFree: item.isFree
      })),
      cartTotal: cart.cartTotal,
      cartCount: cartCount
    };

    res.json({ 
      success: true, 
      message: "Product added to cart successfully",
      cartCount: cartCount,
      wishlistCount: wishlistCount,
      cartData: cartData
    });
  } catch (error) {
    console.error("addToCart error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

const updateCartQuantity = async (req, res) => {
  try {
    const userId = req.session.user?._id;
    const { itemId, action } = req.body;

    if (!userId) {
      return res.status(401).json({ success: false, message: "Please login" });
    }

    if (!itemId || !action) {
      return res.status(400).json({ success: false, message: "Missing item ID or action" });
    }

    const cart = await Cart.findOne({ userId }).populate({
      path: "items.productId",
      populate: { path: "category", select: "isListed" },
      select: "productName salePrice regularPrice quantity isBlocked category"
    });

    if (!cart) return res.status(404).json({ success: false, message: "Cart not found" });

    const itemIndex = cart.items.findIndex(item => item._id.toString() === itemId);
    if (itemIndex === -1) return res.status(404).json({ success: false, message: "Item not found in cart" });

    const cartItem = cart.items[itemIndex];
    const product = cartItem.productId;
    
    const productWithOffer = await applyOfferToProduct(product);
    
    let newQuantity = cartItem.quantity;

    if (action === "increment") newQuantity += 1;
    else if (action === "decrement") newQuantity = Math.max(1, cartItem.quantity - 1);

    if (!product || product.isBlocked || !product.category?.isListed) {
      return res.status(400).json({ success: false, message: "Product unavailable" });
    }

    const MAX_QTY = 5;
    if (newQuantity > MAX_QTY) {
      return res.status(400).json({
        success: false,
        message: `You can only add up to ${MAX_QTY} units of this product`
      });
    }

    if (newQuantity > product.quantity) {
      return res.status(400).json({
        success: false,
        message: `Only ${product.quantity} units available in stock`
      });
    }

    let price;
    if (productWithOffer.hasOffer && productWithOffer.discountPercentage >= 100) {
      price = 0;
    } else if (productWithOffer.hasOffer) {
      price = productWithOffer.discountedPrice;
    } else {
      price = product.salePrice ?? product.regularPrice ?? 0;
    }

    cart.items[itemIndex].quantity = newQuantity;
    cart.items[itemIndex].price = price;
    cart.items[itemIndex].total = newQuantity * price;
    cart.items[itemIndex].originalPrice = productWithOffer.originalPrice || product.regularPrice;
    cart.items[itemIndex].discountPercentage = productWithOffer.discountPercentage;
    cart.items[itemIndex].hasOffer = productWithOffer.hasOffer;
    cart.items[itemIndex].isFree = productWithOffer.hasOffer && productWithOffer.discountPercentage >= 100;

    cart.cartTotal = cart.items.reduce((sum, i) => sum + i.total, 0);
    await cart.save();

    const cartCount = cart.items.reduce((total, item) => total + item.quantity, 0);
    req.session.cartCount = cartCount;

    const itemSavings = productWithOffer.hasOffer && productWithOffer.originalPrice 
      ? (productWithOffer.originalPrice * newQuantity) - (price * newQuantity)
      : 0;

    // Return complete cart data for real-time sync
    const cartData = {
      items: cart.items.map(item => ({
        _id: item._id,
        productId: item.productId._id,
        quantity: item.quantity,
        price: item.price,
        total: item.total,
        originalPrice: item.originalPrice,
        discountPercentage: item.discountPercentage,
        hasOffer: item.hasOffer,
        isFree: item.isFree
      })),
      cartTotal: cart.cartTotal,
      cartCount: cartCount
    };

    res.status(200).json({
      success: true,
      newQuantity,
      itemTotal: cart.items[itemIndex].total,
      cartTotal: cart.cartTotal,
      availableStock: product.quantity,
      cartCount: cartCount,
      price: price,
      itemSavings: itemSavings > 0 ? itemSavings : 0,
      isFree: cart.items[itemIndex].isFree,
      cartData: cartData // Send full cart data for sync
    });
  } catch (error) {
    console.error("updateCartQuantity error:", error);
    res.status(500).json({ success: false, message: "An error occurred while updating quantity" });
  }
};

const removeCartItem = async (req, res) => {
  try {
    const userId = req.session.user?._id;
    const { itemId } = req.body;

    if (!userId) {
      return res.status(401).json({ success: false, message: "Please log in" });
    }

    if (!itemId) {
      return res.status(400).json({ success: false, message: "Item ID is required" });
    }

    const cart = await Cart.findOne({ userId }).populate({
      path: "items.productId",
      populate: { path: "category", select: "isListed" },
      select: "productName salePrice regularPrice quantity isBlocked category"
    });

    if (!cart) return res.status(404).json({ success: false, message: "Cart not found" });

    const itemExists = cart.items.some(item => item._id.toString() === itemId);
    if (!itemExists) {
      return res.status(404).json({ success: false, message: "Item not found in cart" });
    }

    // Remove item
    cart.items = cart.items.filter(item => item._id.toString() !== itemId);

    // Recalculate cart total
    cart.cartTotal = cart.items.reduce((sum, i) => sum + (i.total || 0), 0);
    await cart.save();

    // Update session cart count
    const cartCount = cart.items.reduce((total, item) => total + item.quantity, 0);
    req.session.cartCount = cartCount;

    // Return complete cart data for real-time sync
    const cartData = {
      items: cart.items.map(item => ({
        _id: item._id,
        productId: item.productId._id,
        quantity: item.quantity,
        price: item.price,
        total: item.total,
        originalPrice: item.originalPrice,
        discountPercentage: item.discountPercentage,
        hasOffer: item.hasOffer,
        isFree: item.isFree
      })),
      cartTotal: cart.cartTotal,
      cartCount: cartCount
    };

    res.json({
      success: true,
      message: "Item removed from cart successfully",
      cartTotal: cart.cartTotal,
      cartCount: cartCount,
      cartData: cartData // Send full cart data for sync
    });
  } catch (error) {
    console.error("removeCartItem error:", error);
    res.status(500).json({
      success: false,
      message: "An error occurred while removing the item"
    });
  }
};

const clearCart = async (req, res) => {
  try {
    const userId = req.session.user?._id;

    if (!userId) {
      return res.status(401).json({ success: false, message: "Please log in" });
    }

    // Clear the cart for this user
    await Cart.deleteMany({ userId });

    // Reset session cart count
    req.session.cartCount = 0;

    // Return empty cart data for sync
    const cartData = {
      items: [],
      cartTotal: 0,
      cartCount: 0
    };

    res.json({
      "success": true,
      "message": "Cart cleared successfully",
      "cartCount": 0,
      "cartTotal": 0,
      "cartData": cartData // Send empty cart data for sync
    });

  } catch (error) {
    console.error("clearCart error:", error);
    res.status(500).json({ success: false, message: "Server error while clearing cart" });
  }
};



module.exports = {
  loadCart,
  addToCart,
  updateCartQuantity,
  removeCartItem,
  clearCart,
};