const mongoose = require('mongoose');
const Product = require('../../models/productSchema');
const Category = require('../../models/categorySchema');
const sharp = require('sharp');
const cloudinary = require('cloudinary').v2;
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../config.env') });

// ---------- Cloudinary Configuration ----------
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

/**
 * Upload a buffer to Cloudinary and return the public ID
 */
const uploadToCloudinary = (buffer, folder) => {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder },
      (error, result) => {
        if (error) reject(error);
        else resolve(result);
      }
    );
    stream.end(buffer);
  });
};

/**
 * Process an array of multer memory-storage files:
 * 1. Resize with Sharp
 * 2. Upload to Cloudinary
 * Returns an array of Cloudinary public IDs
 */
const processImages = async (files, folderName) => {
  const publicIds = [];

  for (const file of files) {
    try {
      // Resize image in-memory
      const resizedBuffer = await sharp(file.buffer)
        .resize(440, 440, { fit: 'cover' })
        .toBuffer();

      // Upload to Cloudinary
      const result = await uploadToCloudinary(resizedBuffer, folderName);
      publicIds.push(result.public_id);
    } catch (error) {
      console.error('Error processing/uploading image:', error);
      throw new Error('Image upload failed');
    }
  }

  return publicIds;
};

// ---------- Controller functions ----------

const loadProduct = async function (req, res) {
  try {
    const category = await Category.find({ isListed: true });
    const successMessage = req.query.success;
    const errorMessage = req.query.error;

    res.render('admin/addProduct', {
      category,
      success: successMessage,
      error: errorMessage,
      cloudinaryCloudName: process.env.CLOUDINARY_CLOUD_NAME // Pass to view for image URLs
    });
  } catch (error) {
    console.error('Error loading product list:', error);
    return res.redirect('/admin/products?error=Failed to load products');
  }
};

const validateProductData = (data) => {
  const requiredFields = [
    'productName',
    'regularPrice',
    'salePrice',
    'category',
    'categoryAttribute'
  ];
  return requiredFields.every(field => {
    return data[field] && data[field].toString().trim() !== '';
  });
};

const addProduct = async function (req, res) {
  try {
    const product = req.body;

    if (!validateProductData(product) || !req.files || req.files.length === 0) {
      return res.redirect('/admin/addProduct?error=Please fill all required fields');
    }

    const productExists = await Product.findOne({
      productName: { $regex: new RegExp(`^${product.productName}$`, 'i') }
    });
    if (productExists) {
      return res.redirect('/admin/addProduct?error=Product already exists. Please try with another name');
    }

    // Upload images to Cloudinary
    let images = [];
    if (req.files && req.files.length > 0) {
      images = await processImages(req.files, 'productsImages');
    }

    const CategoryDoc = await Category.findOne({ name: product.category });
    if (!CategoryDoc) {
      return res.status(400).json({ message: 'Invalid category name' });
    }
    if (!CategoryDoc.attributes.includes(product.categoryAttribute)) {
      return res.status(400).json({
        message: `Invalid category attribute. Allowed: ${CategoryDoc.attributes.join(', ')}`
      });
    }

    const newProduct = new Product({
      productName: product.productName,
      description: product.description,
      category: CategoryDoc._id,
      categoryAttribute: product.categoryAttribute,
      regularPrice: parseFloat(product.regularPrice),
      salePrice: parseFloat(product.salePrice),
      discount: product.discount || 0,
      quantity: parseInt(product.quantity),
      color: product.color,
      size: product.size,
      images: images, // Cloudinary public IDs
      isBlocked: false
    });

    await newProduct.save();
    res.redirect('/admin/productLists');
  } catch (error) {
    console.log('error add product:', error);
    return res.redirect('/admin/addProduct?error=Something went wrong while adding the product');
  }
};

const loadProductsList = async function (req, res) {
  try {
    const category = await Category.find({ isListed: true });
    const page = parseInt(req.query.page) || 1;
    const limit = 6;
    let filter = {};

    const search = req.query.search?.trim();
    if (search) {
      filter.$or = [
        { productName: new RegExp(search, 'i') },
        { description: new RegExp(search, 'i') }
      ];
    }

    const productData = await Product.find(filter)
      .populate('category', 'name')
      .skip((page - 1) * limit)
      .limit(limit)
      .sort({ _id: -1 })
      .lean();

    const totalProduct = await Product.countDocuments(filter);
    const totalPage = Math.ceil(totalProduct / limit);

    const errorMessage = req.query.error;
    const successMessage = req.query.success;

    if (category) {
      res.render('admin/products', {
        category,
        currentPage: page,
        product: productData,
        totalProducts: totalProduct,
        totalPages: totalPage,
        searchQuery: search || '',
        success: successMessage,
        error: errorMessage,
        cloudinaryCloudName: process.env.CLOUDINARY_CLOUD_NAME // Pass to view
      });
    } else {
      res.render('admin-error');
    }
  } catch (error) {
    console.error('Error loading product list:', error);
    return res.status(400).json({ error: 'error to load product list page:' });
  }
};

const loadEditProduct = async function (req, res) {
  try {
    const productID = req.params.id;

    if (!mongoose.Types.ObjectId.isValid(productID)) {
      return res.status(400).render('admin/error', {
        message: 'Invalid product ID format'
      });
    }

    const product = await Product.findById(productID).populate('category');
    const category = await Category.find({});

    if (!product) {
      return res.status(404).render('admin/error', {
        message: 'Product not found'
      });
    }
    res.render('admin/editProduct', {
      product,
      category,
      cloudinaryCloudName: process.env.CLOUDINARY_CLOUD_NAME // Pass to view
    });
  } catch (error) {
    console.error('error to load edit product:', error);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

const editProduct = async function (req, res) {
  try {
    const productId = req.params.id;
    const {
      productName,
      description,
      color,
      quantity,
      regularPrice,
      salePrice,
      discount,
      category,
      categoryAttribute,
      size,
      removeImages,
      isListed
    } = req.body;

    // Validate category & attribute
    const categoryDoc = await Category.findOne({ name: category });
    if (!categoryDoc) {
      return res.redirect(`/admin/productLists/edit/${productId}?error=Invalid category`);
    }
    if (!categoryDoc.attributes.includes(categoryAttribute)) {
      return res.redirect(`/admin/productLists/edit/${productId}?error=Invalid category attribute`);
    }

    const currentProduct = await Product.findById(productId);
    if (!currentProduct) {
      return res.redirect(`/admin/productLists?error=Product not found`);
    }

    // Remove selected images from Cloudinary
    let imagesToRemove = [];
    if (removeImages && removeImages.trim() !== '') {
      imagesToRemove = removeImages.split(',');
      // Destroy each image on Cloudinary
      for (const publicId of imagesToRemove) {
        try {
          await cloudinary.uploader.destroy(publicId);
        } catch (err) {
          console.error(`Failed to delete Cloudinary image ${publicId}:`, err);
          // Continue even if one fails
        }
      }
    }

    // Upload new images to Cloudinary
    let newImages = [];
    if (req.files && req.files.length > 0) {
      newImages = await processImages(req.files, 'productsImages');
    }

    // Build updated images array
    let updatedImages = currentProduct.images.filter(
      img => !imagesToRemove.includes(img)
    );
    updatedImages = [...updatedImages, ...newImages];

    const updateFields = {
      productName,
      description,
      color,
      quantity: parseInt(quantity),
      regularPrice: parseFloat(regularPrice),
      salePrice: parseFloat(salePrice),
      discount: parseFloat(discount) || 0,
      category: categoryDoc._id,
      categoryAttribute,
      size,
      images: updatedImages,
      isListed: isListed === 'true' || isListed === true,
      updatedOn: Date.now()
    };

    const updatedProduct = await Product.findByIdAndUpdate(
      productId,
      { $set: updateFields },
      { new: true, runValidators: true }
    );

    if (!updatedProduct) {
      return res.redirect(`/admin/productLists?error=Product not found`);
    }

    res.redirect(`/admin/productLists?success=Product updated successfully`);
  } catch (error) {
    console.error('error editing product:', error);
    res.redirect(`/admin/productLists/edit/${req.params.id}?error=Internal server error`);
  }
};

const toggleList = async function (req, res) {
  try {
    let { productId, isListed } = req.body;
    const isBlocked = !isListed;

    if (!productId) {
      return res.status(400).json({
        success: false,
        error: 'Product ID not found'
      });
    }

    if (typeof isBlocked === 'string') {
      isBlocked = isBlocked === 'true';
    }

    await Product.findByIdAndUpdate(productId, { isBlocked });
    return res.status(200).json({
      success: true,
      message: `Product ${isBlocked ? 'Unlisted' : 'Listed'}`
    });
  } catch (error) {
    console.error('Error toggling product listing:', error);
    res.status(500).json({ success: false, message: 'Internal server' });
  }
};

const deleteProduct = async function (req, res) {
  try {
    const productId = req.params.id;
    const product = await Product.findById(productId);

    if (!product) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }

    // Delete all product images from Cloudinary
    for (const publicId of product.images) {
      try {
        await cloudinary.uploader.destroy(publicId);
      } catch (err) {
        console.error(`Failed to delete Cloudinary image ${publicId}:`, err);
      }
    }

    await Product.findByIdAndDelete(productId);
    res.status(200).json({ success: true, message: 'Product deleted successfully' });
  } catch (error) {
    console.error('Error deleting product:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

module.exports = {
  loadProduct,
  addProduct,
  loadProductsList,
  loadEditProduct,
  editProduct,
  toggleList,
  deleteProduct
};