const express = require('express');
const session = require('express-session');
const cookieParser = require('cookie-parser');
const axios = require('axios');
const path = require('path');
const fs = require('fs');
const exphbs = require('express-handlebars');
const Handlebars = require('handlebars');
const app = express();

// Configura il parser per i dati inviati tramite form e JSON
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(cookieParser('adminadmin')); // Configura il cookie-parser con una chiave segreta

const hbs = exphbs.create({
    helpers: {
        calculateTotal: (cart) => {
            // Questo helper non farà nulla di complesso, 
            // poiché il totale sarà calcolato prima del rendering
            return cart.reduce((total, item) => total + (1 * item.averageSellPrice), 0).toFixed(2);
        }
    }
});


app.engine('handlebars', hbs.engine);
app.set('view engine', 'handlebars');
app.set('views', path.join(__dirname, 'views'));

app.use(session({
    secret: 'adminadmin',
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false }
}));

// Serve file statici
app.use(express.static(path.join(__dirname, 'public')));

app.use((req, res, next) => {
    res.locals.isAuthenticated = req.session.isAuthenticated || false;
    next();
});

const loadData = (filename) => {
    return JSON.parse(fs.readFileSync(path.join(__dirname, 'mock', filename), 'utf8'));
};

// Route per la Home Page
app.get('/', (req, res) => {
    const username = req.signedCookies.username || null;
    res.render('home', { isAuthenticated: !!username, username });
});

app.get('/plp', (req, res) => {
    const products = loadData('products.json');
    res.render('plp', { products });
});

app.get('/items', async (req, res) => {
    try {
        const page = parseInt(req.query.page || "0");
        const pageSize = parseInt(req.query.pageSize || "4");
        const title = req.query.title || "";

        // Effettua la richiesta all'API di PokéTCG
        const response = await axios.get('https://api.pokemontcg.io/v2/cards', {
            params: {
                page: 1, // La API di PokéTCG usa la numerazione delle pagine a partire da 1
                pageSize: 250, // Numero elevato per ottenere tutti i risultati (puoi regolarlo)
            }
        });

        // Filtra i risultati in base alla ricerca parziale del nome
        const allProducts = response.data.data;
        const filteredProducts = allProducts.filter(product =>
            product.name.toLowerCase().includes(title.toLowerCase())
        );

        // Se non ci sono risultati, restituisci un messaggio
        if (!filteredProducts || filteredProducts.length === 0) {
            res.send('<p>No cards found. Try a different search!</p>');
            return;
        }

        // Applica la paginazione sui risultati filtrati
        const paginatedProducts = filteredProducts.slice(page * pageSize, (page + 1) * pageSize);

        // Genera l'HTML per i prodotti
        const productTiles = paginatedProducts.map(product => `
            <div class="product" href="/product/${product.id}" hx-get="/product/${product.id}" hx-target="#modal-overlay" hx-swap="outerHTML" hx-trigger="click">
                <div class="image-container">
                    <img src="${product.images.small}" alt="${product.name}" />
                    <h2>${product.name}</h2>
                </div>
                <div class="content">
                    <p>${product.set.name} - <strong>${product.rarity}</strong></p>
                    <p><strong>Average price:</strong> $${product.cardmarket.prices.averageSellPrice}</p>
                </div>
            </div>
        `);

        // Aggiungi il pulsante "Load More" se ci sono più risultati
        let loadMoreButton = '';
        if (filteredProducts.length > (page + 1) * pageSize) {
            loadMoreButton = `
            <div id="load_more_button_wrapper" class="load_more_button_wrapper">
                <div
                    class="load-more-button" 
                    hx-get="/items?page=${page + 1}&pageSize=${pageSize}&title=${title}" 
                    hx-trigger="click" 
                    hx-target="#load_more_button_wrapper"
                    hx-swap="outerHTML"
                    hx-indicator=".htmx-indicator">
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
app.get('/product/:id', async (req, res) => {
    const productId = req.params.id;
    try {
        // Ottieni i dettagli del prodotto dall'API
        const response = await axios.get('https://api.pokemontcg.io/v2/cards/' + productId);
        const productDetails = response.data;

        // Controlla se i dettagli del prodotto esistono
        if (productDetails) {
            res.render('pdp', { product: productDetails.data, layout: false });
        } else {
            res.status(404).send('Product not found');
        }
    } catch (error) {
        console.error('Errore nel recupero del prodotto:', error.message);
        res.status(500).send('Errore nel recupero dei dettagli del prodotto.');
    }
});


// ******************************************************************** BEGIN CART *******************************************************************************
// Route aggiornata per il carrello
app.get('/cart', async (req, res) => {
    const username = req.session.username; // Prendi il nome utente dalla sessione

    if (username) {
        const users = loadData('carts.json'); // Carica i dati dei carrelli
        const userCart = users[username] || []; // Ottieni il carrello dell'utente

        try {
            // Funzione per ottenere i dettagli di ogni prodotto e calcolare il totale
            const calculateCartTotal = async (cart) => {
                const pricePromises = cart.map(async (productId) => {
                    try {
                        const response = await axios.get('https://api.pokemontcg.io/v2/cards/' + productId);
                        const averageSellPrice = response.data.data.cardmarket?.prices?.averageSellPrice || 0;
                        return { productId, averageSellPrice };
                    } catch (error) {
                        console.error(`Errore nel recupero del prodotto ${productId}:`, error.message);
                        return { productId, averageSellPrice: 0 }; // Ritorna 0 in caso di errore
                    }
                });

                const products = await Promise.all(pricePromises);
                const total = products.reduce((sum, product) => sum + product.averageSellPrice, 0);
                return { products, total: total.toFixed(2) };
            };

            // Calcola i dettagli del carrello e il totale
            const { total } = await calculateCartTotal(userCart);
            res.render('cart', { cart: userCart, total, username });
        } catch (error) {
            console.error('Errore durante il calcolo del totale del carrello:', error.message);
            res.status(500).send('Errore durante il calcolo del totale del carrello.');
        }
    } else {
        res.redirect('/login');
    }
});


app.get('/cart/product/:id', async (req, res) => {
    const productId = req.params.id;
    try {
        // Ottieni i dettagli del prodotto dall'API
        const response = await axios.get('https://api.pokemontcg.io/v2/cards/' + productId);
        const productDetails = response.data.data;

        // Controlla se i dettagli del prodotto esistono
        if (productDetails) {
            // Crea il codice HTML dinamico con i dettagli del prodotto
            const productHtml = `
                <div class="product-details" id="product-${productDetails.id}">
                    <h1>${productDetails.name}</h1>
                    <div class="details-wrapper">
                        <img src="${productDetails.images.large}" alt="${productDetails.name}" />
                        <div class="recap-info">
                            <p><strong>Price:</strong> $${productDetails.cardmarket.prices.averageSellPrice}</p>
                            <p><strong>Set:</strong> ${productDetails.set.name} (${productDetails.set.series})</p>
                            <p><strong>Rarity:</strong> ${productDetails.rarity}</p>
                            <p><strong>HP:</strong> ${productDetails.hp}</p>
                            <input type="hidden" name="productId" value="${productDetails.id}" />
                            <button 
                                class="remove-item" 
                                hx-post="/cart/remove" 
                                hx-trigger="click"
                                hx-include="#product-${productDetails.id} input" 
                                name="product-id" 
                                value="${productDetails.id}">
                                Remove from cart
                            </button>
                        </div>
                    </div>
                </div>
            `;
            
            // Restituisci l'HTML generato come risposta
            res.send(productHtml);
        } else {
            res.status(404).send('Product not found');
        }
    } catch (error) {
        console.error('Errore nel recupero del prodotto:', error.message);
        res.status(500).send('Errore nel recupero dei dettagli del prodotto.');
    }
});


app.post('/cart/add', (req, res) => {
    const username = req.session.username;  // Prendi il nome utente dalla sessione
    const { productId } = req.body;

    if (!username) {
        return res.status(401).send(`
            <div id="cart-feedback" style="color: red;">
                You are not authenticated. Please log in to add items to your cart.
            </div>
        `);
    }

    const cartData = loadData('carts.json');
    const userCart = cartData[username] || [];

    userCart.push(productId);
    cartData[username] = userCart;

    fs.writeFileSync(path.join(__dirname, 'mock', 'carts.json'), JSON.stringify(cartData, null, 2), 'utf8');

    res.status(200).send(`
        <div id="cart-feedback" style="color: green;">
            Product added to cart successfully!
        </div>
    `);
});

app.post('/cart/remove', (req, res) => {
    const username = req.session.username;  // Prendi il nome utente dalla sessione
    const { productId } = req.body;

    if (!username) {
        return res.status(401).send(`
            <div id="cart-feedback" style="color: red;">
                You are not authenticated. Please log in to add items to your cart.
            </div>
        `);
    }

    const cartData = loadData('carts.json');
    let userCart = cartData[username] || [];

    userCart = userCart.filter(id => id !== productId);
    cartData[username] = userCart;

    fs.writeFileSync(path.join(__dirname, 'mock', 'carts.json'), JSON.stringify(cartData, null, 2), 'utf8');
    res.setHeader('HX-Redirect', '/cart');
    res.status(200).end();
});

// ******************************************************************** END CART *******************************************************************************


// ******************************************************************** BEGIN LOGIN *******************************************************************************
app.get('/login', (req, res) => {
    res.render('login');
});

// Modifica del POST di login per salvare il nome utente nella sessione
app.post('/login', (req, res) => {
    const { username, password } = req.body;
    const users = loadData('users.json');  // Carica i dati degli utenti

    const user = users.find(user => user.username === username && user.password === password);

    if (user) {
        // Imposta la sessione dell'utente come autenticato
        req.session.isAuthenticated = true;  // Memorizza la variabile nella sessione
        req.session.username = username;    // Puoi anche memorizzare altre informazioni

        // Reindirizza l'utente o invia una risposta
        res.setHeader('HX-Redirect', '/plp');
        res.status(200).end();
    } else {
        // Risponda con errore se la password è sbagliata
        res.send('<p style="color: red; background: #ffffff7d; padding: 10px; border-radius: 5px;">Invalid username or password</p>');
    }
});

app.get('/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            return res.status(500).send('Errore durante il logout');
        }

        // Dopo aver distrutto la sessione, rimuovi il cookie
        res.clearCookie('connect.sid');  // Pulisce il cookie della sessione

        // Reindirizza l'utente alla pagina di login o home
        res.redirect('/login');
    });
});
// ******************************************************************** END LOGIN *******************************************************************************
//
//
//
//
//
//
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});