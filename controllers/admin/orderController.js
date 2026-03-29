const Product = require("../../models/productSchema");
const User = require("../../models/userSchema");
const Address = require("../../models/addressSchema");
const Order = require("../../models/orderSchema");
const mongoose = require('mongoose');

// GET /admin/orders
const ordersListPage = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = 10;
    const skip = (page - 1) * limit;
    const search = req.query.search?.trim() || '';
    const statusFilter = req.query.status || '';

    // Build query
    let query = {};
    if (statusFilter) query.orderStatus = statusFilter;

    // Search logic
    let searchQuery = {};
    if (search) {
      const users = await User.find({
        $or: [
          { firstName: { $regex: search, $options: 'i' } },
          { lastName: { $regex: search, $options: 'i' } },
          { name: { $regex: search, $options: 'i' } }
        ]
      }).select('_id');

      const addresses = await Address.find({
        "address.name": { $regex: search, $options: 'i' }
      }).select('userId');

      const allUserIds = [
        ...users.map(u => u._id),
        ...addresses.map(a => a.userId)
      ];

      if (allUserIds.length > 0) {
        searchQuery = { userId: { $in: allUserIds } };
      }
    }

    const finalQuery = search ? { ...query, ...searchQuery } : query;

    const orders = await Order.find(finalQuery)
      .populate('userId', 'firstName lastName email phone')
      .populate('orderedItem.productId', 'productName images salePrice') // ✅ fixed
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    const totalOrders = await Order.countDocuments(finalQuery);
    const totalPages = Math.ceil(totalOrders / limit);

    const processedOrders = await Promise.all(
      orders.map(async order => {
        let customerName = 'N/A';

        // Get customer name from address or user
        if (order.deliveryAddress) {
          const addressDoc = await Address.findById(order.deliveryAddress).lean();
          if (addressDoc?.address?.length > 0) {
            customerName = addressDoc.address[0].name;
          }
        } else if (order.userId) {
          customerName = `${order.userId.firstName || ''} ${order.userId.lastName || ''}`.trim();
        }

        const hasReturnedItems = order.orderedItem.some(item =>
          ['Returned', 'Return Requested'].includes(item.productStatus)
        );
        const returnStatus = hasReturnedItems ? 'Return Requested' : 'None';

        const displayOrderId = order.orderNumber
          ? order.orderNumber.toUpperCase()
          : order._id.toString().slice(-8).toUpperCase();

        const subtotal = order.orderedItem?.reduce(
          (sum, item) => sum + (item.productPrice || 0) * (item.quantity || 1),
          0
        ) || 0;

        return {
          ...order,
          customerName,
          returnStatus,
          displayOrderId,
          subtotal,
          finalAmount: order.orderAmount || subtotal,
          formattedDate: new Date(order.createdAt).toLocaleString('en-IN'),
        };
      })
    );

    res.render('admin/orderListing', {
      orders: processedOrders,
      currentPage: page,
      totalPages,
      totalOrders,
      limit,
      search,
      statusFilter,
      hasNextPage: page < totalPages,
      hasPrevPage: page > 1,
      nextPage: page + 1,
      prevPage: page - 1
    });

  } catch (error) {
    console.error('Error fetching orders:', error);
    res.status(500).send(`Error loading orders: ${error.message}`);
  }
};

// GET /admin/orders/:id
const orderDetailsPage = async (req, res) => {
  try {
    const orderId = req.params.id;

    const order = await Order.findById(orderId)
      .populate('userId', 'firstName lastName email phone')
      .populate('orderedItem.productId', 'productName images salePrice description')
      .lean();

    if (!order) {
      return res.status(404).render('admin/error', { message: 'Order not found' });
    }

    // Get shipping address
    const addressDoc = await Address.findById(order.deliveryAddress).lean();
    const shippingAddress = addressDoc?.address?.[0] || null;

    const subtotal = order.orderedItem?.reduce(
      (sum, item) => sum + (item.productPrice || 0) * (item.quantity || 1),
      0
    ) || 0;

    const orderData = {
      ...order,
      displayOrderId: order.orderNumber
        ? order.orderNumber.toUpperCase()
        : order._id.toString().slice(-8).toUpperCase(),
      formattedDate: new Date(order.createdAt).toLocaleString('en-IN'),
      subtotal,
      finalAmount: order.orderAmount || subtotal,
      discount: order.couponDiscount || 0,
      shippingAddress
    };

    res.render('admin/orderDetailPage', { order: orderData });
  } catch (error) {
    console.error('Error fetching order details:', error);
    res.status(500).render('admin/error', { message: error.message });
  }
};

// POST /admin/orders/:id/update - Update order status
const updateOrderDetails = async (req, res) => {
  try {
    const orderId = req.params.id;
    const { orderStatus, paymentStatus, notes } = req.body;

    const order = await Order.findById(orderId);
    if (!order) return res.json({ success: false, message: 'Order not found' });

    // Store old status for logging/notifications
    const oldStatus = order.orderStatus;
    
    // Update order status
    if (orderStatus) {
      order.orderStatus = orderStatus;
      
      // Set dates based on status changes
      const now = new Date();
      if (orderStatus === 'Shipped' && oldStatus !== 'Shipped') {
        order.shippingDate = now;
      } else if (orderStatus === 'Delivered' && oldStatus !== 'Delivered') {
        order.deliveryDate = now;
      } else if (orderStatus === 'Cancelled' && oldStatus !== 'Cancelled') {
        // Restore stock when order is cancelled
        for (const item of order.orderedItem) {
          if (item.productId) {
            await Product.findByIdAndUpdate(item.productId, {
              $inc: { quantity: item.quantity }
            });
          }
        }
        
        // Update payment status to refunded if paid
        if (order.paymentStatus === 'Paid') {
          order.paymentStatus = 'Refunded';
          order.isRefunded = true;
        }
      } else if (orderStatus === 'Returned' && oldStatus !== 'Returned') {
        // Restore stock for returned items
        for (const item of order.orderedItem) {
          if (item.productId) {
            await Product.findByIdAndUpdate(item.productId, {
              $inc: { quantity: item.quantity }
            });
          }
        }
        
        // Update payment status
        if (order.paymentStatus === 'Paid') {
          order.paymentStatus = 'Refunded';
          order.isRefunded = true;
        }
      }
    }

    // Update payment status
    if (paymentStatus) {
      order.paymentStatus = paymentStatus;
    }

    // Add notes if provided
    if (notes) {
      order.adminNotes = order.adminNotes || [];
      order.adminNotes.push({
        note: notes,
        adminId: req.session.admin._id,
        timestamp: new Date()
      });
    }

    await order.save();
    
    res.json({ 
      success: true, 
      message: 'Order updated successfully',
      data: {
        orderId: order._id,
        orderStatus: order.orderStatus,
        paymentStatus: order.paymentStatus
      }
    });
  } catch (error) {
    console.error('Error updating order:', error);
    res.json({ success: false, message: error.message });
  }
};

// POST /admin/orders/:id/return-request/:itemId
const handleOrderReturn = async (req, res) => {
  try {
    const orderId = req.params.id;
    const { action, notes } = req.body;

    const order = await Order.findById(orderId);
    if (!order) return res.json({ success: false, message: 'Order not found' });

    if (action === 'approve') {
      // Approve return
      order.returnStatus = 'Approved';
      order.returnApproved = true;
      order.returnApprovedDate = new Date();
      order.returnNotes = notes;
      
      // Update order status to Returned
      order.orderStatus = 'Returned';
      
      // Restore stock
      for (const item of order.orderedItem) {
        if (item.productId) {
          await Product.findByIdAndUpdate(item.productId, {
            $inc: { quantity: item.quantity }
          });
        }
      }
      
      // Refund payment if paid
      if (order.paymentStatus === 'Paid') {
        order.paymentStatus = 'Refunded';
        order.isRefunded = true;
      }
      
    } else if (action === 'reject') {
      // Reject return
      order.returnStatus = 'Rejected';
      order.returnNotes = notes;
    }

    await order.save();
    
    res.json({ 
      success: true, 
      message: `Return ${action === 'approve' ? 'approved' : 'rejected'} successfully`,
      data: {
        orderId: order._id,
        returnStatus: order.returnStatus
      }
    });
  } catch (error) {
    console.error('Error handling return:', error);
    res.json({ success: false, message: error.message });
  }
};

module.exports = {
  ordersListPage,
  orderDetailsPage,
  updateOrderDetails,
  handleOrderReturn
};
