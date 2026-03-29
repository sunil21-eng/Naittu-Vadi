const User = require('../../models/userSchema');


const customerInfo = async function (req, res) {

    try {

        let search = "";

        if (req.query.search) {
            search = req.query.search
        }

        let page = 1;
        if (req.query.page) {
            page = parseInt(req.query.page);
        }

        let limit = 6;

        const userData = await User.find({
            isAdmin: false,
            $or: [
                { firstName: { $regex: ".*" + search + ".*", $options: "i" } },
                { email: { $regex: ".*" + search + ".*", $options: "i" } }
            ]
        })
            .sort({ createdOn: -1 })
            .limit(limit)
            .skip((page - 1) * limit)
            .exec()


        const count = await User.countDocuments({
            isActive: false,
            $or: [
                { firstName: { $regex: ".*" + search + ".*", $options: "i" } },
                { email: { $regex: ".*" + search + ".*", $options: "i" } }
            ]
        })

        const totalpage = Math.ceil(count / limit);


        res.render("admin/customer-accounts", {
            data: userData,
            currentPage: page,
            totalPages: totalpage
        })

    } catch (error) {

        console.error("Error loading customer info", error);
        res.redirect('/admin/pageError');
    }
}

const blockCustomer = async function (req, res) {

    try {
        let _id = req.query._id;
        if (!_id) {
            return res.redirect('/admin/pageError');
        }
        await User.updateOne({ _id }, { set: { isActive:false} });
        res.redirect(`/admin/user?page=${req.query.page || 1}`)

    } catch (error) {
        console.error("Error blocking customer:", error);
        res.redirect('/admin/pageError');
    }
}


const unBlockCustomer = async function (req, res) {

    try {
        let _id = req.query._id;
        if (!_id) {
            return res.redirect('/admin/pageError');
        }
        await User.updateOne({ _id }, { set: { isActive: true}});
        res.redirect(`/admin/user?page=${req.query.page || 1}`)

    } catch (error) {
        console.error("Error unblocking customer:", error);
        res.redirect('/admin/pageError');
    }

};

const handleCustomerAction = async function (req, res) {
    try {
        const { action, customerIds } = req.body;

        // Validate request
        if (!action || !customerIds || !Array.isArray(customerIds)) {
            return res.status(400).json({ message: 'Invalid request data' });
        }

        if (!['block', 'unblock'].includes(action)) {
            return res.status(400).json({ message: 'Invalid action' });
        }

        // Update customers
        const updateData = action === 'block' ? { isActive: false } : { isActive: true };
        const result = await User.updateMany(
            { _id: { $in: customerIds } },
            { $set: updateData }
        );

        res.status(200).json({
            message: `Successfully ${action}ed ${result.modifiedCount} customers`
        });
    } catch (error) {
        console.error(`Error performing ${req.body.action} action:`, error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

const deleteCustomers = async function (req, res) {
    try {
        const { customerIds } = req.body;

        // Validate request
        if (!customerIds || !Array.isArray(customerIds)) {
            return res.status(400).json({ message: 'Invalid request data' });
        }

        // Delete customers
        const result = await User.deleteMany(
            { _id: { $in: customerIds } }
        );

        res.status(200).json({
            message: `Successfully deleted ${result.deletedCount} customers`
        });
    } catch (error) {
        console.error('Error deleting customers:', error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

module.exports = {
    customerInfo,
    blockCustomer,
    unBlockCustomer,
    handleCustomerAction,
    deleteCustomers

}