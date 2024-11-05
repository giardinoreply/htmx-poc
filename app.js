const express = require('express');
const path = require('path');
const fs = require('fs');
const exphbs = require('express-handlebars');
const app = express();

// Configura il parser per gestire i dati inviati tramite form e JSON
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Handlebars come motore di template
app.engine('handlebars', exphbs.engine());
app.set('view engine', 'handlebars');
app.set('views', path.join(__dirname, 'views'));

// Serve file statici
app.use(express.static(path.join(__dirname, 'public')));

const loadData = (filename) => {
    return JSON.parse(fs.readFileSync(path.join(__dirname, 'mock', filename), 'utf8'));
};

// Route per la Home Page
app.get('/', (req, res) => {
    const products = loadData('products.json');
    res.render('home', { products });
});

app.get('/plp', (req, res) => {
    const products = loadData('products.json');
    res.render('home', { products });
});

//PDP
app.get('/product/:id', (req, res) => {
    const productId = req.params.id;
    const productDetails = loadData('productDetails.json')[productId];
    if (productDetails) {
        res.render('pdp', { product: productDetails });
    } else {
        res.status(404).send('Product not found');
    }
});

//CART
app.get('/cart', (req, res) => {
    res.render('cart');
});

// LOGIN
app.get('/login', (req, res) => {
    res.render('login');
});

app.post('/login', (req, res) => {
    const { username, password } = req.body;
    const users = loadData('users.json');

    // Verifica delle credenziali
    const user = users.find(user => user.username === username && user.password === password);

    if (user) {
        setTimeout(() => {
            res.redirect('/');
        }, 1000);
    } else {
        res.send('<p style="color: red;">Invalid username or password</p>');
    }
});



const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});