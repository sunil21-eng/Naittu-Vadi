const Razorpay = require("razorpay");
const razorpay = require("../../config/rozorpay");
const User = require("../../models/userSchema");
const Wallet = require("../../models/walletSchema");
const Orders = require("../../models/orderSchema");
const crypto = require("crypto");

// ================== CREATE RAZORPAY ORDER ==================
const createOrder = async (req, res) => {
  try {
    const userId = req.session.user?._id || req.session.user;
    if (!userId) return res.status(401).json({ error: "Please log in to continue" });

    const { amount } = req.body;
    if (!amount || amount <= 0) return res.status(400).json({ error: "Invalid amount" });

    const amountInPaise = Math.round(amount * 100);
    if (amountInPaise < 100) return res.status(400).json({ error: "Minimum amount is 1 INR" });

    const receipt = `wlt-${Date.now().toString().slice(-8)}`;

    const options = { amount: amountInPaise, currency: "INR", receipt, payment_capture: 1 };
    const order = await razorpay.orders.create(options);

    req.session.walletOrder = { orderId: order.id, amount, userId };
    res.json({ success: true, order });
  } catch (error) {
    console.error("Error creating Razorpay order:", error);
    res.status(500).json({ error: "Something went wrong", details: error.message });
  }
};

// ================== VERIFY PAYMENT & UPDATE WALLET ==================
const verifyPayment = async (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, amount } = req.body;
    const userId = req.session.user?._id || req.session.user;
    if (!userId) return res.status(401).json({ error: "Please log in to continue" });

    if (!req.session.walletOrder || req.session.walletOrder.orderId !== razorpay_order_id) {
      return res.status(400).json({ error: "Invalid order session" });
    }

    const body = razorpay_order_id + "|" + razorpay_payment_id;
    const expectedSignature = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(body)
      .digest("hex");

    if (expectedSignature !== razorpay_signature) {
      return res.status(400).json({ error: "Invalid signature" });
    }

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ error: "User not found" });

    const amountInRupees = Number(amount) / 100;
    let wallet = await Wallet.findOne({ userId });

    if (!wallet) {
      wallet = new Wallet({
        userId,
        balance: amountInRupees,
        transaction: [{
          amount: amountInRupees,
          transactionsMethod: "Razorpay",
          date: new Date(),
          razorpayOrderId: razorpay_order_id,
          razorpayPaymentId: razorpay_payment_id
        }]
      });
    } else {
      wallet.balance += amountInRupees;
      wallet.transaction.push({
        amount: amountInRupees,
        transactionsMethod: "Razorpay",
        date: new Date(),
        razorpayOrderId: razorpay_order_id,
        razorpayPaymentId: razorpay_payment_id
      });
    }

    await wallet.save();
    req.session.walletOrder = null;

    res.json({
      success: true,
      message: "Payment verified and wallet updated successfully",
      newBalance: wallet.balance
    });
  } catch (error) {
    console.error("Error verifying payment:", error);
    res.status(500).json({ error: "Something went wrong" });
  }
};

// ================== TRANSACTION HISTORY ==================
const transactionHistory = async (req, res) => {
  try {
    const userId = req.session.user?._id || req.session.user;
    if (!userId) {
      return res.status(401).render("error", { message: "Please log in", status: 401 });
    }

    const page = parseInt(req.query.page) || 1;
    const limit = 10;
    const skip = (page - 1) * limit;

    const wallet = await Wallet.findOne({ userId })
      .populate({ path: "transaction.orderId", select: "orderNumber" })
      .lean();

    if (!wallet || wallet.transaction.length === 0) {
      return res.render("user/transactions", {
        wallet: { balance: wallet?.balance || 0, transaction: [] },
        user: req.user || {},
        currentPage: page,
        totalPages: 1,
        totalTransactions: 0
      });
    }

    const sortedTransactions = wallet.transaction.sort((a, b) => new Date(b.date) - new Date(a.date));
    const totalTransactions = sortedTransactions.length;
    const totalPages = Math.ceil(totalTransactions / limit);
    const paginatedTransactions = sortedTransactions.slice(skip, skip + limit);

    res.render("user/transactions", {
      wallet: { ...wallet, transaction: paginatedTransactions },
      user: req.user || {},
      currentPage: page,
      totalPages,
      totalTransactions
    });
  } catch (error) {
    console.error("Error fetching transactions:", error);
    res.status(500).render("error", { message: "Error fetching transactions", status: 500 });
  }
};

// ================== LOAD WALLET PAGE ==================
const loadWallet = async (req, res) => {
  try {
    const userId = req.session.user?._id || req.session.user;
    if (!userId) return res.status(401).redirect("/login");

    const user = await User.findById(userId);
    if (!user) return res.status(404).redirect("/login");

    const page = parseInt(req.query.page) || 1;
    const limit = 5;
    const skip = (page - 1) * limit;

    const wallet = await Wallet.findOne({ userId })
      .populate({ path: "transaction.orderId", select: "orderNumber" });

    let sortedTransactions = [];
    let totalPages = 1;

    if (wallet && wallet.transaction) {
      sortedTransactions = wallet.transaction.sort((a, b) => new Date(b.date) - new Date(a.date));
      const totalTransactions = sortedTransactions.length;
      totalPages = Math.ceil(totalTransactions / limit);
      sortedTransactions = sortedTransactions.slice(skip, skip + limit);
    }

    res.render("user/wallet", {
      user,
      wallet: wallet ? { ...wallet.toObject(), transaction: sortedTransactions } : { balance: 0, transaction: [] },
      TEST_KEY_ID: process.env.RAZORPAY_KEY_ID,
      currentPage: page,
      totalPages
    });
  } catch (error) {
    console.error("Error loading wallet:", error);
    res.status(500).send("An error occurred while loading wallet");
  }
};

// ================== GET WALLET BALANCE (AJAX) ==================
const walletBalance = async (req, res) => {
  try {
    const userId = req.session.user?._id || req.session.user;
    if (!userId) return res.status(401).json({ error: "User not authenticated" });

    const wallet = await Wallet.findOne({ userId });
    res.json({ balance: wallet ? wallet.balance : 0 });
  } catch (error) {
    console.error("Error fetching wallet balance:", error);
    res.status(500).json({ error: "Could not retrieve wallet balance" });
  }
};

// ================== GENERIC WALLET TRANSACTION CREATOR ==================
const createWalletTransaction = async (userId, amount, transactionsMethod, orderId = null) => {
  try {
    let wallet = await Wallet.findOne({ userId });
    if (!wallet) wallet = new Wallet({ userId, balance: 0, transaction: [] });

    const isCredit = ["Credit", "Refund", "Referral", "Razorpay"].includes(transactionsMethod);
    const isDebit = ["Debit", "Payment"].includes(transactionsMethod);

    if (isCredit) wallet.balance += Number(amount);
    else if (isDebit) {
      if (wallet.balance < amount) throw new Error("Insufficient wallet balance");
      wallet.balance -= Number(amount);
    }

    wallet.transaction.push({
      amount: Number(amount),
      transactionsMethod,
      date: new Date(),
      orderId
    });

    await wallet.save();
    return wallet;
  } catch (error) {
    console.error("Error creating wallet transaction:", error);
    throw error;
  }
};

module.exports = {
  verifyPayment,
  createOrder,
  transactionHistory,
  loadWallet,
  walletBalance,
  createWalletTransaction
};
