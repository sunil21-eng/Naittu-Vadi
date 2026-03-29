const mongoose = require('mongoose');
const Product = require('../../models/productSchema');
const Category = require('../../models/categorySchema');
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const { search } = require('../../routes/userRoutes');




const loadProduct = async function (req, res) {

    try {
        const category = await Category.find({ isListed: true })

        const successMessage = req.query.success;
        const errorMessage = req.query.error;

        res.render("admin/addProduct", {
            category: category,
            success: successMessage,
            error: errorMessage
        })
    } catch (error) {
        console.error("Error loading product list:", error);
        return res.redirect("/admin/products?error=Failed to load products");
    }


}



const validateProductData = (data) => {
    const requiredFields = [
        "productName",
        "regularPrice",
        "salePrice",
        "category",
        "categoryAttribute"
    ];

    return requiredFields.every(field => {
        return data[field] && data[field].toString().trim() !== "";
    });
};



const processImages = async function (files, folderName) {
    const images = [];
    const uploadDir = path.join(__dirname, `../../public/uploads/${folderName}`);

    if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
    }

    for (const file of files) {

        const originalPath = file.path;
        const resizedPath = path.join(uploadDir, file.filename)
        try {
            // Read the original file into a buffer
            const originalImageBuffer = await fs.promises.readFile(originalPath);

            // Process the image from the buffer and get the resized image buffer
            const processedImageBuffer = await sharp(originalImageBuffer)
                .resize(440, 440, { fit: "cover" })
                .toBuffer();

            // Write the processed buffer back to the file
            await fs.promises.writeFile(resizedPath, processedImageBuffer);

            images.push(file.filename);
        } catch (error) {
            console.error("Error: processing image ", error);
            throw new Error("Image processing failed");
        }

    }
    return images
}


const addProduct = async function (req, res) {

    try {
        const product = req.body;

        if (!validateProductData(product) || (!req.files || req.files.length === 0)) {
            return res.redirect("/admin/addProduct?error=Please fill all required fields");
        }

        const productExists = await Product.findOne({
            productName: { $regex: new RegExp(`^${product.productName}$`, "i") }
        });
        if (productExists) {
            return res.redirect("/admin/addProduct?error=Product already exists.Please try with another name");
        }

        let images = [];

        if (req.files && req.files.length > 0) {
            images = await processImages(req.files, "productsImages")
            // images = images.map(image => `/uploads/productsImages/${image}`);   
        }

        const CategoryDoc = await Category.findOne({ name: product.category });
        if (!CategoryDoc) {
            return res.status(400).json({ message: "Invalid category name" });
        }
        if (!CategoryDoc.attributes.includes(product.categoryAttribute)) {
            return res.status(400).json({
                message: `Invalid category attribute. Allowed: ${CategoryDoc.attributes.join(", ")}`
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
            images: images,
            isBlocked: false,

        });


        await newProduct.save();
        res.redirect("/admin/productLists");
        // res.status(200).json({ success: true,  message: "Product added successfully",redirectUrl: "/admin/productLists"});


    } catch (error) {
        console.log("error add product:", error);
        return res.redirect("/admin/addProduct?error=Something went wrong while adding the product");
    }

}

const loadProductsList = async function (req, res) {

    try {
        const category = await Category.find({ isListed: true });
        const page = parseInt(req.query.page) || 1
        const limit = 6

        let filter={};

        const search= req.query.search?.trim();

        if(search){
            filter.$or=[{productName: new RegExp(search, 'i')},{description:new RegExp(search,'i')}]
        }

        const productData = await Product.find(filter)
            .populate("category", "name")
            .skip((page - 1) * limit)
            .limit(limit)
            .sort({_id:-1})
            .lean();


        const totalProduct = await Product.countDocuments(filter);
        const totalPage = Math.ceil(totalProduct / limit);


        const errorMessage = req.query.error
        const successMessage = req.query.success

        if (category) {

            res.render("admin/products", {
                category: category,
                currentPage: page,
                product: productData,
                totalProducts: totalProduct,
                totalPages: totalPage,
                searchQuery:search || "",
                success: successMessage,
                error: errorMessage
            })

        } else {
            res.render("admin-error");
        }


    } catch (error) {
        console.error("Error loading product list:", error);
        return res.status(400).json({ error: "error to load product list page:" });
    }
}


const loadEditProduct = async function (req, res) {

    try {
        const productID = req.params.id


        // Validate if the ID is a valid MongoDB ObjectId
        if (!mongoose.Types.ObjectId.isValid(productID)) {
            return res.status(400).render("admin/error", {
                message: "Invalid product ID format"
            });
        }


        const product = await Product.findById(productID)
            .populate("category")
        const category = await Category.find({});


       if (!product) {
            return res.status(404).render("admin/error", { 
                message: "Product not found" 
            });
        }
        res.render("admin/editProduct", { 
            product: product,
            category: category 
        });

    } catch (error) {
        console.error("error to load edit product:", error);
        return res.status(500).json({ success: false, error: "Internal server error" });
    }

}


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

        // Get the current product to work with existing images
        const currentProduct = await Product.findById(productId);
        if (!currentProduct) {
            return res.redirect(`/admin/productLists?error=Product not found`);
        }

        // Handle removed images
        let imagesToRemove = [];
        if (removeImages && removeImages.trim() !== "") {
            imagesToRemove = removeImages.split(",");
            
            // Remove images from filesystem
            imagesToRemove.forEach(img => {
                const imgPath = path.join(__dirname, "../../public/uploads/productsImages", img);
                if (fs.existsSync(imgPath)) fs.unlinkSync(imgPath);
            });
        }

        // Handle new uploads
        let newImages = [];
        if (req.files && req.files.length > 0) {
            newImages = await processImages(req.files, "productsImages");
            // newImages = newImages.map(image => `/uploads/productsImages/${image}`);
        }

        // Build the updated images array
        let updatedImages = currentProduct.images.filter(img => !imagesToRemove.includes(img));
        updatedImages = [...updatedImages, ...newImages];

        // Prepare update fields
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
            images: updatedImages, // Set the complete images array
            isListed: isListed === "true" || isListed === true,
            updatedOn: Date.now()
        };

        // Update product
        const updatedProduct = await Product.findByIdAndUpdate(
            productId,
            { $set: updateFields },
            { new: true, runValidators: true }
        );

        if (!updatedProduct) {
            return res.redirect(`/admin/productLists?error=Product not found`);
        }

        // Redirect back to product list with success message
        res.redirect(`/admin/productLists?success=Product updated successfully`);

    } catch (error) {
        console.error("error editing product:", error);
        res.redirect(`/admin/productLists/edit/${req.params.id}?error=Internal server error`);
    }
};


const toggleList = async function (req, res) {
    try {
        const isListed = req.body.isListed;
        const isBlocked = !isListed;
        let { productId } = req.body;

        if (!productId) {
            return res.status(400).json({
                success: false,
                error: "Product ID not found"
            });
        }

        // Convert string to boolean if needed
        if (typeof isBlocked === "string") {
            isBlocked = isBlocked === "true";
        }

        await Product.findByIdAndUpdate(productId, { isBlocked });

        return res.status(200).json({
            success: true,
            message: `Product ${isBlocked ? "Unlisted" : "Listed"}`
        });

    } catch (error) {
        console.error("Error toggling product listing:", error);
        res.status(500).json({ success: false, message: "Internal server" });
    }
};

const deleteProduct = async function (req, res) {
    try {
        const productId = req.params.id;
        const product = await Product.findById(productId);

        if (!product) {
            return res.status(404).json({ success: false, message: "Product not found" });
        }

        // Delete associated images
        const uploadDir = path.join(__dirname, "../../public/uploads/productsImages");
        product.images.forEach((image) => {
            const imagePath = path.join(uploadDir, image);
            if (fs.existsSync(imagePath)) {
                fs.unlinkSync(imagePath);
            }
        });

        await Product.findByIdAndDelete(productId);
        res.status(200).json({ success: true, message: "Product deleted successfully" });
    } catch (error) {
        console.error("Error deleting product:", error);
        res.status(500).json({ success: false, message: "Internal server error" });
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

}