const Category = require("../../models/categorySchema");

const categoryInfo = async function (req, res) {

    try {

        const page = parseInt(req.query.page) || 1
        const limit = 4;
        const skip = ((page - 1) * limit);

        let filter={};

        const search= req.query.search?.trim();
        if(search){
            filter.$or=[{name:new RegExp(req.query.search, "i")},{description:new RegExp(req.query.search, "i")}];
        }

        const categoryData = await Category.find(filter)
            .sort({ createdOn: -1 })
            .skip(skip)
            .limit(limit);


        const totalCategory = await Category.countDocuments(filter);
        const totalPage = Math.ceil(totalCategory / limit);

        res.render("admin/category", {
            cat: categoryData,
            currentPage: page,
            totalPage: totalPage,
            totalCategories: totalCategory,
            errorMessage: null,
            searchQuery:search ||""
        });

    } catch (error) {

        console.error("Category info error", error);
        res.redirect("admin/pageError");

    }

};

const addCategory = async function (req, res) {

    const { name, description, attributes } = req.body
    const attributesArray = attributes ? attributes.split(',').map(attr => attr.trim()) : [];
    const isListed = req.body.isListed ? true : false;

    try {
        const existCategory = await Category.findOne({ name: { $regex: new RegExp(`^${name}$`, 'i') } })

        if (existCategory) {
            return res.status(409).json({ error: "Category already exists" });
        } else {

            const newCategory = new Category({
                name,
                description,
                attributes: attributesArray,
                isListed
            })
            await newCategory.save();
            return res.json({ success: true, redirectUrl: "/admin/category" });
        }

    } catch (error) {
        console.error("Add Category Error", error);
        return res.status(500).json({ error: "Internal Server Error" });
    }

};



const editCategory = async function (req, res) {

    try {
        const { name, description, attributes } = req.body;
        const categoryId = req.params.id;
        const attributesArray = attributes ? attributes.split(',').map(attr => attr.trim()) : [];
        const isListed = req.body.isListed ? true : false;

        const existCategory = await Category.findOne({
            name: { $regex: new RegExp(`^${name}$`, 'i') },
            _id: { $ne: categoryId }
        });

        if (existCategory) {
            return res.status(409).json({ error: "Category name already exists" });
        }

        await Category.findByIdAndUpdate(categoryId, {
            name,
            description,
            attributes: attributesArray,
            isListed

        })
        res.status(200).json({ success: true, message: "Category updated successfully" });

    } catch (error) {
        console.log("error edit category", error);
        return res.status(500).json({ error: "Internal server error" })
    }

}

// const deleteCategory = async function (req, res) {
//     try {
//         const categoryId = req.params.id;
//         await Category.findByIdAndDelete(categoryId);
//         res.status(200).json({
//             success: true,
//             message: "Category deleted successfully"
//         })

//     } catch (error) {
//         console.log("error delete category", error);
//         return res.status(500).json({ error: "Internal server error" })
//     }
// }



module.exports = {
    categoryInfo,
    addCategory,
    editCategory,
    // deleteCategory,

}
