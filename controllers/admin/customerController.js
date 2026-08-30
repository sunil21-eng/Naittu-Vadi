const User = require('../../models/userSchema');


const customerInfo = async function (req, res) {
    try {
        // 1. Get search term from query string
        let search = "";
        if (req.query.search) {
            search = req.query.search;
        }

        // 2. Get current page (default 1)
        let page = 1;
        if (req.query.page) {
            page = parseInt(req.query.page);
        }

        const limit = 6; // items per page

        // 3. Build the filter object for customers (non‑admin)
        const filter = {
            isAdmin: false,
            $or: [
                { firstName: { $regex: ".*" + search + ".*", $options: "i" } },
                { email: { $regex: ".*" + search + ".*", $options: "i" } }
            ]
        };

        // 4. Fetch customers for the current page (sorted newest first)
        const userData = await User.find(filter)
            .sort({ createdOn: -1 })
            .limit(limit)
            .skip((page - 1) * limit)
            .exec();

        // 5. Count total matching documents (for pagination)
        const count = await User.countDocuments(filter);

        const totalPages = Math.ceil(count / limit);

        // 6. Render the view, passing ALL needed variables
        res.render("admin/customer-accounts", {
            data: userData,
            currentPage: page,
            totalPages: totalPages,
            search: search   // <-- now passed to the EJS template
        });

    } catch (error) {
        console.error("Error loading customer info", error);
        res.redirect('/admin/pageError');
    }
};

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