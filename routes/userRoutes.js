const express = require('express');
const router = express.Router();
const userController = require('../controllers/user/userController');
const profileEditController = require('../controllers/user/profileEditController');
const cartController = require('../controllers/user/cartController');
const profileController= require('../controllers/user/profileController');
const orderController= require('../controllers/user/orderController');
const walletController = require("../controllers/user/walletController");
const {userAuth,checkUserStatus }= require('../middlewares/auth');
const {getHeaderCounts, count} = require('../middlewares/headerCounts');
const passport = require("passport");
const  {uploadProfile} = require('../utils/multer');


router.get('/pageNotFound',userController.pageNotFound);
router.get('/signup',userController.loadSignup);
router.post('/signup',userController.signup);
router.post('/verify-otp',userController.verify_otp);
router.post('/resend-otp',userController.resend_otp)
router.get('/login',userController.loadlogin)
router.post('/login',userController.login)
router.get("/forgotPassword", profileController.loadForgot);
router.post("/forgotPassword", profileController.forgotPasword);
router.post("/forgotVerifyotp", profileController.verifyForgototp);
router.post("/resendForgotOtp", profileController.forgotResendOtp);
router.get("/resetPassword", profileController.getResetPassword);
router.post("/resetPassword", profileController.resetPassword);
router.get('/logout',userController.logout);


router.get("/auth/google",passport.authenticate('google',{scope:["profile","email"]}));
router.get("/auth/google/callback",passport.authenticate("google",{failureRedirect:'/login'}),(req,res) => {
    req.session.user = {_id:req.user._id, email: req.user.email};
    res.redirect('/');
});

router.use(getHeaderCounts);
router.use(checkUserStatus);
router.get('/header-counts',userAuth,count);

// User Profile Routes
router.get('/profile',userAuth ,profileEditController.userProfile)
router.get('/editProfile',userAuth,profileEditController.editProfile)
router.post('/editProfile', userAuth, uploadProfile.single('profileImage'),profileEditController.updateProfile)
router.delete('/updateImage', userAuth, profileEditController.deleteProfileImage);
router.get('/changePassword',userAuth, profileEditController.changePassword)
router.post('/changePassword',userAuth, profileEditController.updatePassword)
router.get('/addresses',userAuth, profileEditController.getAddresses)
router.get('/addAddress',userAuth, profileEditController.addAddress)
router.post('/addAddress',userAuth, profileEditController.addNewAddress)
router.get('/editAddress/:addressId',userAuth, profileEditController.getEditAddress)
router.put('/updateAddress',userAuth,profileEditController.updateAddress)
router.post('/setDefaultAddress',userAuth, profileEditController.setDefaultAddress);
router.delete('/deleteAddress', userAuth,profileEditController.deleteAddress);
router.post('/resendProfileOtp',userAuth ,profileEditController.resendProfileOtp);
router.post('/verifyProfileOtp',userAuth, profileEditController.verifyProfileOtp);


router.get('/',userController.loadHome);

router.get('/loadHome',userController.loadHome);
router.get('/product/:id',userController.loadProduct);
router.get('/contact',userController.loadContact);
router.get('/about',userController.loadAbout);
// router.use(userAuth);
router.get('/product/:id',userAuth,userController.loadProduct)
router.get('/wishlist' ,userAuth, userController.getWishlist);
router.post('/wishlist/toggle',userAuth, userController.toggleWishlist);
router.delete('/wishlist/remove/:productId' ,userAuth, userController.removeFromWishlist)
router.post("/wishlist/add",userAuth,userController.addToWishlist);

// Cart Management
router.get('/cart',userAuth,cartController.loadCart);
router.post('/cart/add',userAuth, cartController.addToCart);
router.post('/updateQuantity',userAuth, cartController.updateCartQuantity);
router.post('/removeItem', userAuth, cartController.removeCartItem);
router.post('/clear',userAuth, cartController.clearCart);  


// Wallet Routes (Authenticated)
router.get("/wallet", userAuth, walletController.loadWallet);
router.get("/wallet/balance", userAuth, walletController.walletBalance);
router.post("/wallet/verify-payment", userAuth, walletController.verifyPayment);
router.post("/wallet/create-order", userAuth, walletController.createOrder);
router.get("/wallet/transactions", userAuth, walletController.transactionHistory);


router.get("/checkout",userAuth, orderController.getCheckoutPage)
router.post("/addAddress" ,userAuth, orderController.addAddress)
router.get('/getAddress/:addressId',userAuth, profileEditController.getAddressForModal);

router.post('/applyCoupon',userAuth,orderController.applyCoupon)
router.post('/removeCoupon',userAuth, orderController.removeCoupon)
router.post("/placeOrder" , userAuth,orderController.placeOrder)
router.get("/orderSuccess/:orderId",userAuth, orderController.orderSuccessPage)
router.post('/create-razorpay-order',userAuth, orderController.createRazorpayOrder);
router.post('/verify-payment',userAuth, orderController.verifyPayment);
router.get('/orderFailure/:orderId', userAuth,orderController.renderPaymentFailure)
router.post('/payment-failed', userAuth,orderController.updatePaymentFailed)




// User orders
router.get('/my-orders',userAuth, orderController.loadOrdersPage);
router.get('/orders/my-orders',userAuth, orderController.getUserOrders);
router.get('/orders/view/:orderId', userAuth, orderController.getUserOrderDetails);
router.patch('/orders/:orderId/cancel', userAuth, orderController.cancelOrder);
router.post('/orders/cancel-item', userAuth, orderController.cancelItem);
router.post('/orders/return-item',userAuth, orderController.returnItem);
router.get('/orders/:orderId/invoice',userAuth, orderController.generateInvoice);



module.exports = router;