const express = require('express');
const axios = require('axios');
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
    res.render('plp', { products });
});

app.get('/items', async (req, res) => {
    try {
        // Recupera l'offset dalla query string, default 0
        const offset = parseInt(req.query.offset || "0");
        const limit = parseInt(req.query.limit || "3");; // Limitiamo a 3 prodotti per chiamata

        // Effettua la richiesta all'API
        const response = await axios.get('https://api.escuelajs.co/api/v1/products', {
            params: {
                offset: offset,
                limit: limit
            }
        });

        const products = response.data;

        // Genera l'HTML per i prodotti
        const productTiles = products.map(product => `
            <div class="product">
                <img src="${product.images[0]}" alt="${product.title}" />
                <h2>${product.title}</h2>
                <p>${product.description.substring(0, 100)}...</p>
                <p><strong>Price:</strong> $${product.price}</p>
                <a href="/product/${product.id}" hx-get="/product/${product.id}" hx-target="#product-details">
                    View Details
                </a>
            </div>
        `);

        // Aggiungi il pulsante "Load More" all'interno del div dei prodotti
        let loadMoreButton = '';
        if (products.length === limit) {
            loadMoreButton = `
            <div id="load_more_button_wrapper" class="load_more_button_wrapper">
                <div
                    class="load-more-button" 
                    hx-get="/items?offset=${offset + limit}" 
                    hx-trigger="click" 
                    hx-target="#load_more_button_wrapper"
                    hx-swap="outerHTML">
                    Load More
                </div>
            </div>
        `;        
        }

        // Restituisci i prodotti e il pulsante Load More
        res.send(productTiles.join('') + loadMoreButton);

    } catch (error) {
        console.error('Errore nel recupero dei prodotti:', error);
        res.status(500).send('Errore interno del server');
    }
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