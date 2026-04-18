const express = require('express');
const router = express.Router();
const adminController = require('../controllers/admin/adminController');
const customerController = require('../controllers/admin/customerController');
const categoryController = require('../controllers/admin/categoryController');
const productController = require("../controllers/admin/productController");
const orderController = require("../controllers/admin/orderController");
const salesreportController = require("../controllers/admin/salesreportController");
const couponController = require("../controllers/admin/couponController");
const offerController = require("../controllers/admin/offerController");
const multer = require('multer');
const  {uploadProduct} = require('../utils/multer');
const { adminAuth } = require("../middlewares/auth");

// login management
router.get('/login', adminController.loadLogin);
router.post('/login', adminController.login);
router.get('/logout', adminController.logout);

router.get('/dashboard',adminController.loadDash);
router.get('/', adminAuth, adminController.loadDash);

// router.use(adminAuth);
// admin management
router.get('/user',adminAuth, customerController.customerInfo);
router.get('/blockCustomer', adminAuth,customerController.blockCustomer);
router.get('/unBlockCustomer',adminAuth, customerController.unBlockCustomer);
router.post('/customers/action',adminAuth, customerController.handleCustomerAction);
router.post('/customers/delete', adminAuth, customerController.deleteCustomers);

// category management
router.get('/category', adminAuth,categoryController.categoryInfo);
router.post('/addCategory',adminAuth, categoryController.addCategory);
router.put('/editCategory/:id',adminAuth, categoryController.editCategory);
// router.delete('/deleteCategory/:id',adminAuth, categoryController.deleteCategory);

// New route for fetching category attributes
router.get('/categoryAttributes', async (req, res) => {
    try {
        const categoryName = req.query.category;
        const category = await Category.findOne({ name: categoryName });
        
        if (!category) {
            return res.status(404).json({ error: 'Category not found' });
        }
        
        res.json({ attributes: category.attributes });
    } catch (error) {
        console.error('Error fetching category attributes:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});


//product management

router.use('/addProduct', (error, req, res, next) => {

    if (error instanceof multer.MulterError) {
        if (error.code === "LIMIT_FILE_SIZE") {
            return res.redirect("/admin/addProduct?error=File too large . Max file size is 10MB per file.");
        }
        if(error.code ==="LIMIT_FILE_COUNT"){
            return res.redirect("/admin/addProduct?error=Too many files . max 5 files allowed")
        }
    }
    if(error.message.includes("Invalid file type")){
        return res.redirect("/admin/addProduct?error=Invalid file type. only JPEG,JPG or PNG are allowed")
    }
    next(error);
});

router.get("/addProduct",adminAuth,productController.loadProduct);
router.post('/addProduct',adminAuth, uploadProduct.array("images", 10), productController.addProduct);
router.get("/productLists", adminAuth,productController.loadProductsList);
router.get("/productLists/edit/:id",adminAuth, productController.loadEditProduct);
router.post("/productLists/edit/:id",adminAuth,uploadProduct.array("images", 10), productController.editProduct);
router.post('/productLists/toggleList',adminAuth, productController.toggleList);
router.delete("/productLists/:id",adminAuth, productController.deleteProduct);


//Order Management
router.get('/orders' ,adminAuth, orderController.ordersListPage);
router.get('/orders/:id', adminAuth, orderController.orderDetailsPage);
router.post('/orders/:id/update', adminAuth, orderController.updateOrderDetails);
router.post('/orders/:id/return-request/:itemId',adminAuth, orderController.handleOrderReturn);


// Sales Report Routes
router.get("/salesreport", adminAuth, salesreportController.getSalesReport);
router.get("/salesreport/download/pdf", adminAuth, salesreportController.downloadPDF);
router.get("/salesreport/download/excel", adminAuth, salesreportController.downloadExcel);

// Coupon Routes
router.get("/coupon", adminAuth, couponController.loadCoupon);
router.get("/couponsearch", adminAuth, couponController.loadCoupon);
router.get("/addcoupon", adminAuth, couponController.loadAddCoupon);
router.post("/addcoupon", adminAuth, couponController.addCoupon);
router.get("/editcoupon/:couponId", adminAuth, couponController.editCoupon);
router.post("/updatecoupon/:couponId", adminAuth, couponController.updateCoupon);
router.post("/blockcoupon/:couponId", adminAuth, couponController.blockCoupon);

// Offer Routes
router.get("/offer", adminAuth, offerController.loadOffer);
router.get("/offersearch", adminAuth, offerController.loadOffer);
router.get("/addoffer", adminAuth, offerController.loadAddOffer);
router.post("/addoffer", adminAuth, offerController.addOffer);
router.get("/editoffer/:offerId", adminAuth, offerController.loadEditOffer);
router.post("/updateoffer/:offerId", adminAuth, offerController.editOffer);
router.post("/blockoffer/:offerId", adminAuth, offerController.blockOffer);


module.exports = router;