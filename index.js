/* ALL NECESSARY IMPORTS ---------------------------------------------------------------------------------------------*/

const express = require('express');                          //Default from Express.js
const cors = require('cors');                      //From CORS Middleware, but positioned here for better reliability and instructed in the document.
const app = express();                                             //Default from Express.js

require('dotenv').config();                                                    //Default from dotenv package.
// console.log(process.env);                                                   //Remove this after you've confirmed it is working.

const port = process.env.PORT || 3000;                            //Default from Express.js but .env applied, therefore positioned after dotenv import.
// console.log(port);

const jwt = require('jsonwebtoken');                                       //Default from JSON Web Token.

const cookieParser = require('cookie-parser');      //Default from cookie-parser package.





/* ALL NECESSARY MIDDLEWARES -----------------------------------------------------------------------------------------*/

/* It enables Cross-Origin Resource Sharing (CORS), allowing your server to handle requests from different allowed origins or domains securely.
Credentials: true allows sending and receiving credentials (like cookies or authorization headers) with cross-origin requests.
Methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] specifies which HTTP methods are allowed for cross-origin requests. */
app.use(cors({
    origin: [
        'http://localhost:5173',
        'https://agadgetswap.netlify.app',
    ],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
}))

/* It helps to parse incoming JSON payloads from the client (e.g., a POST or PUT request with a JSON body) into a JavaScript object, accessible via req.body. */
app.use(express.json());

/* Parses incoming requests with URL-encoded payloads, typically used when data is sent from HTML forms.
Setting extended: true enables parsing of nested objects, allowing for more complex form data structures. */
app.use(express.urlencoded({extended: true}))

/* It allows the server to parse and handle cookies sent by the client in HTTP requests.
After using cookieParser(), you can access cookies through req.cookies (for normal cookies) and req.signedCookies (for signed cookies) in your routes. */
app.use(cookieParser());





// Custom middleware for JWT verification.
const verifyJWT = (req, res, next) => {
    const email = req?.body?.email;
    const token = req?.cookies?.token;
    // console.log({email, token});

    // If there is no JWT
    if (!token) {
        return res.send({status: 401, message: "No token provided, authorization denied!"});
    }

    // Verify the JWT
    jwt.verify(token, process.env.ACCESS_JWT_SECRET, (error, decoded) => {
        if (error) {
            return res.send({status: 402, message: "Invalid or expired token!"});
        }
        req.decoded_email = decoded?.data;
        next(); // Call the next middleware.
    });
};





/* MONGODB CONNECTIONS AND APIS --------------------------------------------------------------------------------------*/

const {MongoClient, ServerApiVersion, ObjectId} = require('mongodb');


/* The URI points to a specific MongoDB cluster and includes options for retrying writes and setting the write concern. */
const uri = `mongodb+srv://${process.env.MONGODB_USER}:${process.env.MONGODB_PASSWORD}@cluster0.ktxyk.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`; //From MongoDB Connection String

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});

console.log('Current selected Domain: ', process.env.NODE_ENVIRONMENT === 'production' ? 'agadgetswap.netlify.app' : 'localhost');

async function run() {
    try {
        // Connect the client to the server	(optional starting in v4.7)
        // await client.connect();
        // Send a ping to confirm a successful connection
        // await client.db("admin").command({ ping: 1 });
        // console.log("Pinged your deployment. You successfully connected to MongoDB!");
        const database = client.db("GadgetSwapApplicationSystemDB");





        /*====================================== AUTH RELATED APIs ===================================================*/

        app.post('/generate_jwt_and_get_token', async (req, res) => {
            const {email} = req.body;

            //Generating JSON Web Token.
            const token = jwt.sign({data: email}, process.env.ACCESS_JWT_SECRET, {expiresIn: '1h'});
            // console.log(token)

            //Setting JWT, at the client side, in the HTTP only cookie.
            res.cookie('token', token, {
                httpOnly: true,                                                                                                             //Cookies access restricted from client side.
                secure: process.env.NODE_ENVIRONMENT === 'production',                                                                      //Set false while in dev environment, and true while in production.
                sameSite: process.env.NODE_ENVIRONMENT === 'production' ? 'none' : 'Lax',                                                   //Protection from CSRF. None or lax supports most cross-origin use cases.
                maxAge: 3600000,                                                                                                            //Token validity in millisecond. Setting this to cookies.
            }).status(201).send({token, success: true, message: "Login Successful, JWT stored in Cookie!"});
        })


        app.post('/logout_and_clear_jwt', (req, res) => {
            // Clearing the HTTP-only cookie by setting maxAge to 0.
            res.clearCookie('token', {
                httpOnly: true,                                                                                                             //Cookies access restricted from client side.
                secure: process.env.NODE_ENVIRONMENT === 'production',                                                                      //Set false while in dev environment, and true while in production.
                sameSite: process.env.NODE_ENVIRONMENT === 'production' ? 'none' : 'Lax',                                                   //Protection from CSRF. None or lax supports most cross-origin use cases.
                maxAge: 0,                                                                                                                  //Token validity in millisecond. Setting this to cookies.
            }).status(200).send({success: true, message: "Logout successful, cookie cleared!"});
        });





        /*====================================== USERS COLLECTION ====================================================*/


        /* CREATING (IF NOT PRESENT) / CONNECTING THE COLLECTION NAMED "userCollection" AND ACCESS IT */
        const userCollection = database.collection("userCollection");


        /* VERIFY JWT MIDDLEWARE WILL NOT WORK HERE, USER MAY UNAVAILABLE */
        app.post('/users/add_new_user', async (req, res) => {
            try {
                const {newUser} = req.body;
                const result = await userCollection.insertOne(newUser);
                if (result){
                    res.send({status: 201, message: "User created successfully."});
                }
            } catch (error) {
                res.send({status: 500, message: "Internal Server Error"});
            }
        });


        /* VERIFY JWT MIDDLEWARE WILL NOT WORK HERE, USER MAY UNAVAILABLE */
        app.post('/users/find_availability_by_email', async (req, res) => {
            const { email } = req.body;
            const query = { email: email };
            const result = await userCollection.findOne(query);
            if (result) {
                res.send({ status: 409, exists: true, message: 'Registration failed. Email already exists!' });
            } else {
                res.send({ status: 404, exists: false, message: 'Email address not exists!' });
            }
        });


        /* VERIFY JWT MIDDLEWARE WILL NOT WORK HERE, USER MAY UNAVAILABLE */
        app.post('/users/get_user_by_email', async (req, res) => {
            const { email } = req.body;
            const query = { email: email };
            const result = await userCollection.findOne(query);
            // res.status(200).send(result);
            res.send({status: 200, data: result, message: 'Login successful!'});
        })





        /*====================================== GADGETS COLLECTION ====================================================*/


        /* CREATING (IF NOT PRESENT) / CONNECTING THE COLLECTION NAMED "gadgetsCollection" AND ACCESS IT */
        const gadgetsCollection = database.collection("gadgetsCollection");


        // GET endpoint for top 3 gadgets per category
        app.get("/gadgets/featured_gadgets_for_home_page", async (req, res) => {
            try {
                const categories = ["Smartphones", "Laptops", "Tablets", "Smartwatches", "Cameras",
                    "Gaming", "Audio", "Headphones", "Speakers", "Wearables", "VR", "Drones", "Projectors"];

                let featuredGadgets = [];

                // Loop through each category
                for (const category of categories) {
                    const gadgets = await gadgetsCollection
                        .find({category}) // Filter by category
                        .sort({totalRentalCount: -1}) // Sort by popularity (descending)
                        .limit(3) // Top 3 only
                        .toArray();

                    // Map to requested format
                    const formattedGadgets = gadgets.map((gadget) => ({
                        id: gadget?._id.toString(),
                        name: gadget?.name,
                        category: gadget?.category,
                        image: gadget?.images[0], // First image
                        pricePerDay: gadget?.pricing?.perDay,
                        average_rating: gadget?.average_rating,
                        description: gadget?.description,
                    }));

                    featuredGadgets = featuredGadgets.concat(formattedGadgets);
                }

                // Return the formatted data
                return res.send({
                    status: 200,
                    data: featuredGadgets,
                    message: "Featured gadgets, for home page, fetched successfully!"
                });
            }
            catch (error) {
                console.error("Failed to fetch featured gadgets, for home page! :", error);
                return res.send({
                    status: 500,
                    message: "Failed to fetch featured gadgets, for home page!"
                });
            }
        });


        /* VERIFY JWT MIDDLEWARE WILL NOT WORK HERE, USER MAY UNAVAILABLE */
        app.get("/gadgets/get_all_gadgets_for_gadgets_page", async (req, res) => {
            try {
                // Fetch all gadgets from the collection
                const allGadgetObjects = await gadgetsCollection.find().toArray();

                // Transform data into requested format
                const formattedGadgets = allGadgetObjects.map((gadget) => ({
                    id: gadget?._id.toString(), // Convert ObjectId to string
                    name: gadget?.name,
                    category: gadget?.category,
                    image: gadget?.images[0], // First image from the array
                    average_rating: gadget?.average_rating,
                    pricePerDay: gadget?.pricing?.perDay,
                    description: gadget?.description,
                    popularity: gadget?.totalRentalCount, // Using totalRentalCount as popularity
                }));

                // Return the formatted data
                return res.send({
                    status: 200,
                    data: formattedGadgets,
                    message: "Gadgets, for gadgets page, fetched successfully!"
                });
            }
            catch (error) {
                console.error("Failed to fetch Gadgets, for gadgets page! :", error);
                return res.send({
                    status: 500,
                    message: "Failed to fetch Gadgets, for gadgets page!"
                });
            }
        });


        /* VERIFY JWT MIDDLEWARE WILL NOT WORK HERE, USER MAY UNAVAILABLE */
        app.get("/gadgets/get_gadget_details_by_id/:id", async (req, res) => {
            const { id } = req.params;
            const query = { _id: new ObjectId(id) };
            const gadgetResult = await gadgetsCollection.findOne(query);
            if (gadgetResult) {
                res.send({
                    status: 200,
                    data: gadgetResult,
                    message: 'Gadget details by id fetched successfully!' });
            } else {
                res.send({
                    status: 404,
                    message: 'Failed to fetch Gadget details by id! Gadget not found!'
                });
            }
        });





        /*============================================================================================================*/


    } catch (error) {
        console.error('MongoDB connection error:', error);
    } finally {
        // Ensures that the client will close when you finish/error
        // await client.close();
    }
}

run().catch(console.dir);





/* REST CODE OF EXPRESS.JS -------------------------------------------------------------------------------------------*/

/* This defines a route handler for the root URL (/).
When a GET request is made to the root, it sends the response: "GadgetSwap Rental Marketplace Application Server Side is running!". */
app.get('/', (req, res) => {
    res.send('GadgetSwap Rental Marketplace Application Server Side is running!');
})





/* This starts the Express server and listens for incoming connections on the specified port.
It logs a message in the console indicating the app is running and the port it's listening on. */
app.listen(port, () => {
    console.log(`GadgetSwap Rental Marketplace Application listening on port ${port}`);
})
