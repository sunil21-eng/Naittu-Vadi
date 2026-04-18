const Offer = require("../../models/offerSchema");
const Category = require("../../models/categorySchema");
const Product = require("../../models/productSchema");

const loadOffer = async (req, res) => {
  try {
    const searchQuery = req.query.query || "";
    console.log(searchQuery);
    const page = parseInt(req.query.page) || 1;
    const limit = 5;

    const searchFilter = searchQuery
      ? {
          $or: [{ offerName: { $regex: searchQuery, $options: "i" } }],
        }
      : {};

    const skip = (page - 1) * limit;

    const totaloffers = await Offer.countDocuments(searchFilter);
    const totalPages = Math.ceil(totaloffers / limit);

    const offers = await Offer.find(searchFilter)

      .skip(skip)
      .limit(limit)
      .sort({ createdAt: -1 });

    res.render("admin/adminoffer", {
      searchQuery,
      offers,
      pagination: {
        currentPage: page,
        totalPages: totalPages,
      },
      pages: Array.from({ length: totalPages }, (_, i) => i + 1),
    });
  } catch (error) {
    console.log(error);
  }
};

const loadAddOffer = async (req, res) => {
  try {
    const categories = await Category.find();
    const products = await Product.find();
    res.render("admin/addoffer", { categories, products });
  } catch (error) {
    console.log(error);
  }
};


const addOffer = async (req, res) => {
  try {
    console.log(req.body);

    const {
      offerName,
      discount,
      offerType,
      startDate,
      endDate,
      productId,
      categoryId,
      status,
    } = req.body;

    // Check if offer with same name already exists
    const existingOffer = await Offer.findOne({ offerName });
    if (existingOffer) {
      return res.status(409).json({
        success: false,
        message: "Offer already exists. Please add a new offer."
      });
    }

    // Parse the JSON strings that came from the frontend
    let parsedProductId = [];
    let parsedCategoryId = [];

    try {
      if (productId && productId !== '[]') {
        parsedProductId = JSON.parse(productId);
      }
      if (categoryId && categoryId !== '[]') {
        parsedCategoryId = JSON.parse(categoryId);
      }
    } catch (parseError) {
      console.error("Error parsing IDs:", parseError);
    }

    // Validate based on offer type
    if (offerType === 'product' && (!parsedProductId || parsedProductId.length === 0)) {
      return res.status(400).json({
        success: false,
        message: "Please select a product for this offer"
      });
    }

    if (offerType === 'category' && (!parsedCategoryId || parsedCategoryId.length === 0)) {
      return res.status(400).json({
        success: false,
        message: "Please select a category for this offer"
      });
    }

    // Create new offer object
    const newOffer = new Offer({
      offerName,
      discount: parseInt(discount),
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      offerType,
      productId: parsedProductId,
      categoryId: parsedCategoryId,
      status: status === "true" ? true : false,
    });

    await newOffer.save();
    
    // Redirect with success message
    res.redirect("/admin/offer?success=Offer created successfully");
    
  } catch (error) {
    console.error("Error in addOffer:", error);
    res.status(500).json({
      success: false,
      message: "An error occurred while creating the offer"
    });
  }
};





const loadEditOffer = async (req, res) => {
  try {
    const offerId = req.params.offerId;
    const offer = await Offer.findOne({ _id: offerId });
    const categories = await Category.find();
    const products = await Product.find();
    
    // Ensure productId and categoryId are arrays for consistent handling
    if (offer.productId && !Array.isArray(offer.productId)) {
      offer.productId = [offer.productId];
    }
    if (offer.categoryId && !Array.isArray(offer.categoryId)) {
      offer.categoryId = [offer.categoryId];
    }
    
    return res.render("admin/editoffer", { offer, categories, products });
  } catch (error) {
    console.log("Error in loadEditOffer:", error);
    res.redirect('/admin/offer?error=Error loading offer');
  }
};

const editOffer = async (req, res) => {
  try {
    console.log("Request body:", req.body);
    
    const {
      offerName,
      discount,
      offerType,
      startDate,
      endDate,
      categoryId,
      productId,
      status,
    } = req.body;
    
    const offerId = req.params.offerId;
    
    // Check if offer exists
    const existingOffer = await Offer.findById(offerId);
    if (!existingOffer) {
      return res.status(404).json({
        success: false,
        message: "Offer not found",
      });
    }
    
    // Check for duplicate offer name (excluding current offer)
    const duplicateOffer = await Offer.findOne({ 
      offerName: offerName.trim(), 
      _id: { $ne: offerId } 
    });
    
    if (duplicateOffer) {
      return res.status(409).json({
        success: false,
        message: "An offer with this name already exists. Please use a different name."
      });
    }
    
    // Parse the JSON strings that came from the frontend
    let parsedProductId = [];
    let parsedCategoryId = [];
    
    try {
      if (productId && productId !== '[]') {
        parsedProductId = JSON.parse(productId);
      }
      if (categoryId && categoryId !== '[]') {
        parsedCategoryId = JSON.parse(categoryId);
      }
    } catch (parseError) {
      console.error("Error parsing IDs:", parseError);
    }
    
    // Validate based on offer type
    if (offerType === 'product' && (!parsedProductId || parsedProductId.length === 0)) {
      return res.status(400).json({
        success: false,
        message: "Please select a product for this offer"
      });
    }
    
    if (offerType === 'category' && (!parsedCategoryId || parsedCategoryId.length === 0)) {
      return res.status(400).json({
        success: false,
        message: "Please select a category for this offer"
      });
    }
    
    // Prepare update data
    const updateData = {
      offerName: offerName.trim(),
      discount: parseInt(discount),
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      offerType,
      productId: parsedProductId,
      categoryId: parsedCategoryId,
      status: status === "true" || status === true,
    };
    
    // Update the offer
    const updatedOffer = await Offer.findByIdAndUpdate(
      offerId,
      { $set: updateData },
      { new: true, runValidators: true }
    );
    
    if (!updatedOffer) {
      return res.status(404).json({
        success: false,
        message: "Offer not found"
      });
    }
    
    // Redirect with success message
    res.redirect('/admin/offer?success=Offer updated successfully');
    
  } catch (error) {
    console.error("Error in editOffer:", error);
    res.status(500).json({
      success: false,
      message: "An error occurred while updating the offer"
    });
  }
};

const blockOffer = async (req, res) => {
  try {
    const offerId = req.params.offerId;
    const offer = await Offer.findOne({ _id: offerId });

    if (!offer) {
      return res.status(404).json({
        success: false,
        message: "Offer not found",
      });
    }

    const newStatus = !offer.status;
    await Offer.updateOne({ _id: offerId }, { $set: { status: newStatus } });
    
    return res.json({
      success: true,
      message: `Offer ${newStatus ? "activated" : "blocked"} successfully`,
      newStatus: newStatus,
    });
  } catch (error) {
    console.error("Error updating offer status:", error);
    return res.status(500).json({
      success: false,
      message: "An error occurred while updating the offer status.",
    });
  }
};

module.exports = {
  loadOffer,
  loadAddOffer,
  addOffer,
  blockOffer,
  editOffer,
  loadEditOffer,
};
