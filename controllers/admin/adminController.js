const mongoose = require('mongoose');
const User = require("../../models/userSchema");
const bcrypt = require('bcrypt');


const loadLogin = (req, res) => {

     if (req.session.admin) {
          return res.redirect('/admin');
     }
     res.render('admin/admin-login', { message: null });
}


const login = async function (req, res) {

     try {

          const { email, password } = req.body;

          const admin = await User.findOne({ email, isAdmin: true })

          if (admin) {

               const passwordMatch = await bcrypt.compare(password, admin.password);

               if (passwordMatch) {
                    req.session.admin = { _id: admin._id, email: admin.email };
                    console.log("Redirecting admin to /admin/dashboard");
                    res.redirect('/admin/dashboard')
               } else {
                    console.log('password not match');
                    res.redirect('/admin/login')
               }


          } else {
               console.log('no admin found');
               return res.redirect('/admin/login')
          }

     } catch (error) {

          console.log('login error:', error);
          return res.redirect('/admin/pageError')

     }

}



const pageError = async function (req, res) {
     try {
          res.render("admin/admin-error")
     } catch (error) {
          res.status(500).json({ error: "Internal server error" });
     }
}


const loadDash = async function (req, res) {

     try {
          if (!req.session.admin) {
               return res.redirect("admin/admin-login")
          }
          return res.render("admin/dashboard");
     } catch (error) {
          return res.redirect("/pageError");
     }

}

const logout = async function (req, res) {

     // try {
     //      req.session.destroy((err) => {

     //           if (err) {
     //                console.log("Error destroying ssession", err);
     //                return res.redirect('/admin/pageError');
     //           }
     //           return res.redirect("/admin/login")

     //      });

     // } catch (error) {
     //      console.log("logout failed", error)
     //      res.redirect('/admin/pageError');
     // }

     
       try {
        delete req.session.admin;  // only remove admin data
        return res.redirect('/admin/login');
    } catch (error) {
        console.log("logout failed", error);
        return res.redirect('/admin/pageError');
    }

}



module.exports = {
     loadLogin,
     login,
     pageError,
     loadDash,
     logout
}