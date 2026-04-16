const express = require('express');
const app = express();
const dotenv = require('dotenv');
const path = require('path');
const userRoutes = require('./routes/userRoutes');
const adminRoutes = require('./routes/adminRoutes');
const session = require("express-session");
const flash = require("connect-flash");
const passport = require("./config/passport");
const cookieParser = require("cookie-parser");
const MongoStore = require("connect-mongo");
const Razorpay = require('razorpay');

dotenv.config({ path: path.join(__dirname, 'config/config.env') });

app.use(cookieParser());


app.use((req, res, next) => {
    res.setHeader("Cache-Control", "no-store", "no-cache", "must-revalidate", "proxy-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
    res.setHeader("Surrogate-Control", "no-store");
    next();
});

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(flash());
app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: true,
    store: MongoStore.create({
        mongoUrl: process.env.DB_MONGO_URI ,
        collectionName: "sessions",
    }),
    cookie: {
        httpOnly: true,
        secure: false,
        sameSite: "lax",
        maxAge: 24 * 60 * 60 * 1000
    }
}));


app.use((req, res, next) => {
  res.locals.messages = {
    success: req.flash("success"),
    error: req.flash("error")
  };
  next();
});

app.use(passport.initialize());
app.use(passport.session())


app.set('view engine', 'ejs');
app.use(express.static(path.join(__dirname, 'public')));

const connectDatabase = require('./config/database');
connectDatabase();



app.use('/', userRoutes);
app.use('/admin', adminRoutes);



const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {

    console.log(`Server running on http://localhost:${PORT}`)
});
