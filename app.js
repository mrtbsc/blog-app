if (process.env.NODE_ENV !== "production") {
	require('dotenv').config()
}

const express = require('express');
const app = express();
const path = require('path');
const mongoose = require('mongoose');
const methodOverride = require('method-override');
const ejsMate = require('ejs-mate');
const { get } = require('http');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const flash = require('connect-flash');

const passport = require('passport');
const LocalStrategy = require('passport-local');
const mongoSanitize = require('express-mongo-sanitize');
const helmet = require('helmet');

const catchAsync = require('./utils/catchAsync');
const AppError = require('./utils/AppError');
const Post = require('./models/posts');
const Category = require('./models/categories');
const User = require('./models/users');

const postsRoutes = require('./routes/posts');
const catRoutes = require('./routes/categories');
const usersRoutes = require('./routes/users');
const dbUrl = process.env.DB_URL || "mongodb://localhost:27017/blogApp";
const secret = process.env.SECRET || 'thisshouldbeabettersecret!';

/**************** CONNECT WITH THE DB ****************/
mongoose.connect( dbUrl, { //'mongodb://localhost:27017/blogApp', { 
    useNewUrlParser: true, 
    useUnifiedTopology: true, 
    useFindAndModify: false 
});

const db = mongoose.connection;
db.on("error", console.error.bind(console, "connection error:"));
db.once("open", () => { console.log("Database connected"); });

/**************** EXTERNAL MIDDLEWARE ****************/


app.engine('ejs', ejsMate)
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'))

app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use(methodOverride('_method'));

const store = new MongoStore({
    mongoUrl: dbUrl,
    secret,
    touchAfter: 24 * 3600
})

store.on("error", function (e) {
    console.log("SESSION STORE ERROR", e)
})

const sessionConfig = {
    store,
    name: 'session',
    secret,
    resave: false,
    saveUninitialized: true,
    cookie: {
        httpOnly: true,
        //secure: true,
        expires: Date.now() + 1000 * 60 * 60 * 24 * 7,
        maxAge: 1000 * 60 * 60 * 24 * 7
    }
}

app.use(session(sessionConfig));
app.use(flash());
app.use(helmet({contentSeurityPolicy: false}));

const scriptSrcUrls = [
    "https://stackpath.bootstrapcdn.com/",
    "https://api.tiles.mapbox.com/",
    "https://api.mapbox.com/",
    "https://kit.fontawesome.com/",
    "https://cdnjs.cloudflare.com/",
    "https://cdn.jsdelivr.net",
    "https://code.jquery.com/",
    "https://cdn.ckeditor.com/"
];
const styleSrcUrls = [
    "https://kit-free.fontawesome.com/",
    "https://stackpath.bootstrapcdn.com/",
    "https://api.mapbox.com/",
    "https://api.tiles.mapbox.com/",
    "https://fonts.googleapis.com/",
    "https://use.fontawesome.com/",
    "https://cdn.jsdelivr.net/",                 // bootstrap source
    "https://cdn.ckeditor.com/"
    
];
const connectSrcUrls = [
    "https://api.mapbox.com/",
    "https://a.tiles.mapbox.com/",
    "https://b.tiles.mapbox.com/",
    "https://events.mapbox.com/",
];
const fontSrcUrls = [
    "https://use.fontawesome.com/",
];
app.use(
    helmet.contentSecurityPolicy({
        directives: {
            defaultSrc: [],
            connectSrc: ["'self'", ...connectSrcUrls],
            scriptSrc: ["'unsafe-inline'", "'self'", ...scriptSrcUrls],
            styleSrc: ["'self'", "'unsafe-inline'", ...styleSrcUrls],
            workerSrc: ["'self'", "blob:"],
            objectSrc: [],
            imgSrc: [
                "'self'",
                "blob:",
                "data:",
                "https://res.cloudinary.com/dec2ratwh/",
                "https://images.unsplash.com/",
                "https://cdn.ckeditor.com/"
            ],
            fontSrc: ["'self'", ...fontSrcUrls],
        },
    })
);

app.use(passport.initialize());
app.use(passport.session());
app.use(mongoSanitize());

passport.use(new LocalStrategy(User.authenticate())); 

passport.serializeUser(User.serializeUser()); 
passport.deserializeUser(User.deserializeUser());

app.use((req, res, next) => {
    res.locals.success = req.flash('success');
    res.locals.error = req.flash('error');
    res.locals.currentUser = req.user;
    res.locals.isAdmin = req.session.isAdmin;
    next();
})

/**************** GENERAL MIDDLEWARE ****************/

app.get('*', (req, res, next) => {

    if (req.originalUrl !== '/users/login' 
            && req.originalUrl !== '/users/logout'
            && req.originalUrl !== '/users/register'){
        req.session.returnTo = req.originalUrl;
    }
    console.log(req.originalUrl);
    next();

})

/**************** ROUTES ****************/
app.use('/posts', postsRoutes);           
app.use('/categories', catRoutes);
app.use('/users', usersRoutes)

app.get('/', catchAsync( async (req, res) => {
    const posts = await Post.find().
    populate('category', 'name').
    populate('author', 'username');
    const categories = await Category.find({}, 'name');
    const usersCount = await User.countDocuments();
    
    res.render('dashboard', { posts, categories, usersCount });
}))

app.all( '*', (req, res, next) => {
    next( new AppError('Page not found', 404) );
})

/**************** ERROR HANDLER ****************/
app.use( (err, req, res, next) => {
    const { statusCode = 500 } = err;
    if (!err.message) err.message = 'D: Something Went Wrong!'
    res.status(statusCode).render('error', { err })
})

/**************** SERVER START ****************/
const port = process.env.PORT || 3000;
app.listen(port, () => {
    console.log(`Serving app on port ${port}`)
})