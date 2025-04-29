/* ALL NECESSARY IMPORTS ---------------------------------------------------------------------------------------------*/

const express = require('express');                          //Default from Express.js
const cors = require('cors');                      //From CORS Middleware, but positioned here for better reliability and instructed in the document.
const app = express();                                             //Default from Express.js

require('dotenv').config();                                                    //Default from dotenv package.
// console.log(process.env);                                                   //Remove this after you've confirmed it is working.

const port = process.env.PORT || 3000;                            //Default from Express.js but .env applied, therefore positioned after dotenv import.
// console.log(port);

const jwt = require('jsonwebtoken');                                       //Default from JSON Web Token.

const cookieParser = require('cookie-parser');      //Default from the cookie-parser package.





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


/* The URI points to a specific MongoDB cluster and includes options for retrying writings and setting the writing concern. */
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
                secure: process.env.NODE_ENVIRONMENT === 'production',                                                                      //Set false while in the dev environment, and true while in production.
                sameSite: process.env.NODE_ENVIRONMENT === 'production' ? 'none' : 'Lax',                                                   //Protection from CSRF. None or lax supports most cross-origin use cases.
                maxAge: 3600000,                                                                                                            //Token validity in millisecond. Setting this to cookies.
            }).status(201).send({token, success: true, message: "Login Successful, JWT stored in Cookie!"});
        })


        app.post('/logout_and_clear_jwt', (req, res) => {
            // Clearing the HTTP-only cookie by setting maxAge to 0.
            res.clearCookie('token', {
                httpOnly: true,                                                                                                             //Cookies access restricted from client side.
                secure: process.env.NODE_ENVIRONMENT === 'production',                                                                      //Set false while in the dev environment, and true while in production.
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
                const { newUser } = req.body;

                // Input validation
                if (!newUser || !newUser.email) {
                    return res.status(400).send({ status: 400, message: "newUser and email are required!" });
                }

                // Check if a user already exists
                const existingUser = await userCollection.findOne({ email: newUser?.email });
                if (existingUser) {
                    return res.status(409).send({ status: 409, message: "User with this email already exists!" });
                }

                // Insert new user
                const userResult = await userCollection.insertOne(newUser);
                if (!userResult.insertedId) {
                    return res.status(500).send({ status: 500, message: "Failed to insert user!" });
                }

                // Insert message chain
                const messageChain = {
                    user_displayName: newUser?.displayName,
                    user_email: newUser?.email,
                    user_photoURL: newUser?.personalDetails?.photoURL,
                    total_count: 0,
                    unreadByUser_count: 0,
                    unreadByAdmin_count: 0,
                    message_chain: []
                };
                const messageResult = await messagesCollection.insertOne(messageChain);
                if (!messageResult.insertedId) {
                    await userCollection.deleteOne({ _id: userResult.insertedId });
                    return res.status(500).send({ status: 500, message: "Failed to create message chain!" });
                }

                // Update user with messageChain_id
                await userCollection.updateOne(
                    { _id: userResult.insertedId },
                    { $set: { messageChain_id: messageResult.insertedId.toString() } }
                );

                // Insert notification chain
                const notificationChain = {
                    user_displayName: newUser?.displayName,
                    user_email: newUser?.email,
                    total_count: 0,
                    unreadByUser_count: 0,
                    unreadByAdmin_count: 0,
                    notification_chain: []
                };
                const notificationResult = await notificationsCollection.insertOne(notificationChain);
                if (!notificationResult.insertedId) {
                    await userCollection.deleteOne({ _id: userResult.insertedId });
                    await messagesCollection.deleteOne({ _id: messageResult.insertedId });
                    return res.status(500).send({ status: 500, message: "Failed to create notification chain!" });
                }

                // Update user with notificationChain_id
                await userCollection.updateOne(
                    { _id: userResult.insertedId },
                    { $set: { notificationChain_id: notificationResult.insertedId.toString() } }
                );

                // Insert activity history chain
                const activityHistoryChain = {
                    user_displayName: newUser?.displayName,
                    user_email: newUser?.email,
                    total_count: 0,
                    activityHistory_chain: []
                };
                const activityHistoryResult = await activityHistoriesCollection.insertOne(activityHistoryChain);
                if (!activityHistoryResult.insertedId) {
                    await userCollection.deleteOne({ _id: userResult.insertedId });
                    await messagesCollection.deleteOne({ _id: messageResult.insertedId });
                    await notificationsCollection.deleteOne({ _id: notificationResult.insertedId });
                    return res.status(500).send({ status: 500, message: "Failed to create activity history chain!" });
                }

                // Update user with activityHistoryChain_id
                await userCollection.updateOne(
                    { _id: userResult.insertedId },
                    { $set: { activityHistoryChain_id: activityHistoryResult.insertedId.toString() } }
                );

                return res.send({
                    status: 201,
                    data: { userId: userResult.insertedId },
                    message: "User created successfully."
                });
            } catch (error) {
                console.error(error);
                if (error.message.includes("already exists")) {
                    return res.send({ status: 409, message: "User with this email already exists!" });
                }
                return res.send({ status: 500, message: error.message || "Internal Server Error" });
            }
        });


        /* VERIFY JWT MIDDLEWARE WILL NOT WORK HERE, USER MAY UNAVAILABLE */
        app.post('/users/find_availability_by_email', async (req, res) => {
            try {
                const { email } = req.body;

                // Input validation
                if (!email) {
                    return res.status(400).send({ status: 400, message: "Email is missing!" });
                }

                // Find the user
                const userQuery = { email: email };
                const userResult = await userCollection.findOne(userQuery);

                if (!userResult) {
                    return res.send({ status: 404, exists: false, message: 'Email address not exists!' });
                }

                // Update lastLogin
                const newLastLogin = new Date().toISOString();
                const updateField = {
                    $set: { lastLogin: newLastLogin }
                };
                const options = { upsert: true };
                const updatedUser = await userCollection.updateOne(userQuery, updateField, options);

                // Fetch updated user data to get the new lastLogin
                const updatedUserResult = await userCollection.findOne(userQuery);

                // Prepare a user impression with updated data
                const userImpression = {
                    loginWith: updatedUserResult.loginWith,
                    lastLogin: updatedUserResult.lastLogin, // Use updated lastLogin
                    failedLoginAttempts: updatedUserResult?.failedLoginAttempts,
                    lastFailedLoginAttempt: updatedUserResult?.lastFailedLoginAttempt,
                    loginRestricted: updatedUserResult?.loginRestricted,
                    loginRestrictedUntil: updatedUserResult?.loginRestrictedUntil
                };

                return res.send({ status: 409, exists: true, userImpression, message: 'Registration failed. Email already exists!' });

            } catch (error) {
                console.error('Failed to check email availability:', error);
                return res.send({ status: 404, exists: false, message: 'Email address not exists!' });
            }
        });


        /* VERIFY JWT MIDDLEWARE WILL NOT WORK HERE, USER MAY UNAVAILABLE */
        app.post('/users/get_user_by_email', async (req, res) => {
            try {
                const { email } = req.body;

                // Input validation
                if (!email) {
                    return res.status(400).send({ status: 400, message: "Email is required!" });
                }

                // Find the user
                const userQuery = { email: email };
                const userResult = await userCollection.findOne(userQuery);

                if (!userResult) {
                    return res.status(404).send({ status: 404, message: "User not found!" });
                }

                // Check if login is restricted and reset fields if true
                if (userResult.loginRestricted === true) {
                    const updateFields = {
                        failedLoginAttempts: 0,
                        lastFailedLoginAttempt: 0,
                        loginRestricted: false,
                        loginRestrictedUntil: null
                    };

                    await userCollection.updateOne(
                        userQuery,
                        { $set: updateFields }
                    );

                    // Fetch updated user data
                    const updatedUserResult = await userCollection.findOne(userQuery);
                    return res.send({ status: 200, data: updatedUserResult, message: "Login successful!" });
                }

                return res.send({ status: 200, data: userResult, message: "Login successful!" });

            } catch (error) {
                console.error('Failed to fetch user:', error);
                return res.status(500).send({ status: 500, message: "Internal Server Error" });
            }
        });


        app.post('/users/get_full_user_profile_details', verifyJWT, async (req, res) => {
            try {
                const { userEmail } = req.body;

                // Input validation
                if (!userEmail) {
                    return res.send({ status: 400, message: "Email is required!" });
                }

                // Verifying user authenticity
                const { decoded_email } = req;
                if (userEmail !== decoded_email) {
                    return res.send({ status: 403, message: "Forbidden access, email mismatch!" });
                }

                // Find the user
                const userQuery = { email: userEmail };
                const userResult = await userCollection.findOne(userQuery);

                // Check if a user exists
                if (!userResult) {
                    return res.send({ status: 404, message: "User not found!" });
                }

                // Filter sensitive data (can also be password, tokens)
                const { _id, uid, ...filteredUserData } = userResult;

                return res.send({status: 200, data: filteredUserData, message: "Full user details fetched successfully!"});

            } catch (error) {
                console.error(error);
                return res.send({ status: 500, message: "Something went wrong!" });
            }
        });


        app.patch('/users/add_or_remove_a_gadget_id_to_or_from_wishlist', verifyJWT, async (req, res) => {
            try {
                const { userEmail, gadgetId } = req.body;

                // Input validation
                if (!userEmail || !gadgetId) {
                    return res.status(400).send({ status: 400, message: "userEmail and gadgetId are required!" });
                }

                // Verifying user authenticity
                const { decoded_email } = req;
                if (userEmail !== decoded_email) {
                    return res.status(403).send({ status: 403, message: "Forbidden access, email mismatch!" });
                }

                // Find the user
                const query = { email: userEmail };
                const userResult = await userCollection.findOne(query);
                if (!userResult) {
                    return res.status(404).send({ status: 404, message: "User not found!" });
                }

                // Check if gadgetId exists in wishlist
                const userWishlistArray = userResult.wishlist || [];
                const gadgetExists = userWishlistArray.includes(gadgetId);

                // Prepare update operation
                const update = gadgetExists
                    ? { $pull: { wishlist: gadgetId } }
                    : { $addToSet: { wishlist: gadgetId } };

                // Update the wishlist
                const updatedUserResult = await userCollection.updateOne(query, update);
                const postUpdateUserResult = await userCollection.findOne(query);

                // Check if the update was successful
                if (updatedUserResult.modifiedCount > 0) {

                    const message = gadgetExists
                        ? "Gadget removed from wishlist successfully!"
                        : "Gadget added to wishlist successfully!";
                    return res.send({ status: 200, message: message, data: postUpdateUserResult.wishlist });
                } else {
                    return res.send({ status: 400, message: "No changes made to the wishlist!", data: postUpdateUserResult.wishlist });
                }

            } catch (error) {
                console.error(error);
                return res.send({ status: 500, message: "Something went wrong!" });
            }
        });


        /* VERIFY JWT MIDDLEWARE WILL NOT WORK HERE, USER MAY UNAVAILABLE */
        app.patch('/users/failed_login_attempt', async (req, res) => {
            try {
                const { email } = req.body;

                // Input validation
                if (!email) {
                    return res.status(400).send({ status: 400, message: "Email is required!" });
                }

                // Find the user
                const userQuery = { email: email };
                const userResult = await userCollection.findOne(userQuery);
                if (!userResult) {
                    return res.status(404).send({ status: 404, message: "User not found!" });
                }

                // Increment failedLoginAttempts and update lastFailedLoginAttempt
                let updateFields = {
                    failedLoginAttempts: userResult.failedLoginAttempts + 1,
                    lastFailedLoginAttempt: new Date().getTime()
                };

                // Check if failedLoginAttempts reaches 3, then set login restrictions
                if (updateFields.failedLoginAttempts >= 3) {
                    updateFields.loginRestricted = true;
                    updateFields.loginRestrictedUntil = new Date().getTime() + (10 * 60 * 1000); // Lock for 10 minutes
                }

                // Update the user document
                const updateResult = await userCollection.updateOne(
                    userQuery,
                    { $set: updateFields }
                );

                // Check if the update was successful
                if (updateResult.modifiedCount === 0) {
                    return res.send({ status: 500, message: "Failed to update failed login attempt!" });
                }

                return res.send({
                    status: 200,
                    message: updateFields.loginRestricted
                        ? "Account locked for 10 minutes due to multiple failed login attempts!"
                        : "Failed login attempt recorded!"
                });

            } catch (error) {
                console.error('Failed to record failed login attempt:', error);
                return res.status(500).send({ status: 500, message: "Internal Server Error" });
            }
        });


        app.patch('/users/update_user_profile_info', verifyJWT, async (req, res) => {
            try {
                const { userEmail, userInfoObj } = req.body;

                // Input validation
                if (!userEmail || !userInfoObj) {
                    return res.status(400).send({ status: 400, message: "User email or user info is missing!" });
                }

                // Verifying user authenticity
                const { decoded_email } = req;
                if (userEmail !== decoded_email) {
                    return res.status(403).send({ status: 403, message: "Forbidden access, email mismatch!" });
                }

                // Find the user
                const userQuery = { email: userEmail };
                const userResult = await userCollection.findOne(userQuery);
                if (!userResult) {
                    return res.status(404).send({ status: 404, message: "User not found!" });
                }

                // Update the user profile with the provided fields
                const updateFields = {
                    displayName: userInfoObj.displayName,
                    email: userInfoObj.email,
                    personalDetails: {
                        bio: userInfoObj.personalDetails.bio,
                        profession: userInfoObj.personalDetails.profession,
                        photoURL: userInfoObj.personalDetails.photoURL,
                        phone: userInfoObj.personalDetails.phone,
                        billingAddress: {
                            street: userInfoObj.personalDetails.billingAddress.street,
                            city: userInfoObj.personalDetails.billingAddress.city,
                            zipCode: userInfoObj.personalDetails.billingAddress.zipCode,
                            state: userInfoObj.personalDetails.billingAddress.state,
                            country: userInfoObj.personalDetails.billingAddress.country
                        }
                    }
                };

                // Get the message chain of this user and update respective fields
                const messageChain = await messagesCollection.findOne({user_email: userEmail});
                if (messageChain) {
                    await messagesCollection.updateOne(
                        {user_email: userEmail},
                        {
                            $set: {
                                user_displayName: userInfoObj.displayName,
                                user_photoURL: userInfoObj.personalDetails.photoURL,
                            }
                        }
                    )
                }

                // Get the notification chain of this user and update respective fields
                const notificationChain = await notificationsCollection.findOne({user_email: userEmail});
                if (notificationChain) {
                    await notificationsCollection.updateOne(
                        {user_email: userEmail},
                        {
                            $set: {
                                user_displayName: userInfoObj.displayName,
                            }
                        }
                    )
                }

                // Get the activityHistories chain of this user and update respective fields
                const activityHistoriesChain = await activityHistoriesCollection.findOne({user_email: userEmail});
                if (activityHistoriesChain) {
                    await activityHistoriesCollection.updateOne(
                        {user_email: userEmail},
                        {
                            $set: {
                                user_displayName: userInfoObj.displayName,
                            }
                        }
                    )
                }

                // Check if all personalDetails and billingAddress fields are filled
                const allPersonalDetailsFilled = !!updateFields.personalDetails.bio &&
                    !!updateFields.personalDetails.profession &&
                    !!updateFields.personalDetails.photoURL &&
                    !!updateFields.personalDetails.phone;

                const allBillingAddressFilled = !!updateFields.personalDetails.billingAddress.street &&
                    !!updateFields.personalDetails.billingAddress.city &&
                    !!updateFields.personalDetails.billingAddress.zipCode &&
                    !!updateFields.personalDetails.billingAddress.state &&
                    !!updateFields.personalDetails.billingAddress.country;

                // Set verified as a boolean based on whether all fields are filled
                updateFields.personalDetails.verified = allPersonalDetailsFilled && allBillingAddressFilled;

                const updateResult = await userCollection.updateOne(
                    userQuery,
                    { $set: updateFields }
                );

                // Check if the update was successful
                /*if (updateResult.modifiedCount === 0) {
                    return res.status(500).send({ status: 500, message: "Failed to update user profile!" });
                }*/
                if (updateResult.modifiedCount === 0) {
                    // Check if the provided data matches the existing data
                    const isSameData =
                        userResult.displayName === userInfoObj.displayName &&
                        userResult.email === userInfoObj.email &&
                        userResult.personalDetails.bio === userInfoObj.personalDetails.bio &&
                        userResult.personalDetails.profession === userInfoObj.personalDetails.profession &&
                        userResult.personalDetails.photoURL === userInfoObj.personalDetails.photoURL &&
                        userResult.personalDetails.phone === userInfoObj.personalDetails.phone &&
                        userResult.personalDetails.billingAddress.street === userInfoObj.personalDetails.billingAddress.street &&
                        userResult.personalDetails.billingAddress.city === userInfoObj.personalDetails.billingAddress.city &&
                        userResult.personalDetails.billingAddress.zipCode === userInfoObj.personalDetails.billingAddress.zipCode &&
                        userResult.personalDetails.billingAddress.state === userInfoObj.personalDetails.billingAddress.state &&
                        userResult.personalDetails.billingAddress.country === userInfoObj.personalDetails.billingAddress.country;

                    if (isSameData) {
                        // No changes to update, but this is not an error
                        const updatedUserResult = await userCollection.findOne(userQuery);
                        return res.send({ status: 200, data: updatedUserResult, message: "User profile is already up to date!" });
                    } else {
                        // There were changes, but the update failed
                        return res.status(500).send({ status: 500, message: "Failed to update user profile!" });
                    }
                }

                // Fetch updated user data
                const updatedUserResult = await userCollection.findOne(userQuery);
                return res.send({status: 200, data: updatedUserResult, message: "User profile updated successfully!"});

            } catch (error) {
                console.error('Failed to update user profile:', error);
                return res.send({ status: 500, message: "Internal Server Error" });
            }
        });


        app.patch('/users/update_user_membership_info', verifyJWT, async (req, res) => {
            try {
                const { userEmail, userMembershipObj } = req.body;

                // Input validation
                if (!userEmail || !userMembershipObj) {
                    return res.status(400).send({ status: 400, message: "User email or membership info is missing!" });
                }

                // Verifying user authenticity
                const { decoded_email } = req;
                if (userEmail !== decoded_email) {
                    return res.status(403).send({ status: 403, message: "Forbidden access, email mismatch!" });
                }

                // Find the user
                const userQuery = { email: userEmail };
                const userResult = await userCollection.findOne(userQuery);
                if (!userResult) {
                    return res.status(404).send({ status: 404, message: "User not found!" });
                }

                // Update membership-related fields
                const updateFields = {
                    joinDate: userMembershipObj.joinDate,
                    membershipDetails: {
                        membershipTier: userMembershipObj.membershipDetails.membershipTier,
                        points: userMembershipObj.membershipDetails.points,
                        loyaltyProgressPercentage: userMembershipObj.membershipDetails.loyaltyProgressPercentage,
                        rentalStreak: userMembershipObj.membershipDetails.rentalStreak,
                        referrals: userMembershipObj.membershipDetails.referrals,
                        nextTier: userMembershipObj.membershipDetails.nextTier,
                        pointsToNextTier: userMembershipObj.membershipDetails.pointsToNextTier
                    }
                };

                const updateResult = await userCollection.updateOne(
                    userQuery,
                    { $set: updateFields }
                );

                // Check if the update was successful
                if (updateResult.modifiedCount === 0) {
                    return res.status(500).send({ status: 500, message: "Failed to update membership info!" });
                }

                // Fetch updated user data
                const updatedUserResult = await userCollection.findOne(userQuery);
                return res.status(200).send({
                    status: 200,
                    data: updatedUserResult,
                    message: "Membership info updated successfully!"
                });

            } catch (error) {
                console.error('Failed to update membership info:', error);
                return res.status(500).send({ status: 500, message: "Internal Server Error" });
            }
        });


        app.post('/users/get_full_details_of_all_users_for_admin', verifyJWT, async (req, res) => {
            try {
                const { adminEmail } = req.body;

                // Input validation
                if (!adminEmail) {
                    return res.status(400).send({ status: 400, message: "Admin email is missing!" });
                }

                // Verifying admin authenticity
                const { decoded_email } = req;
                if (adminEmail !== decoded_email) {
                    return res.status(403).send({ status: 403, message: "Forbidden access, email mismatch!" });
                }

                // Find the admin user
                const adminQuery = { email: adminEmail };
                const adminResult = await userCollection.findOne(adminQuery);
                if (!adminResult) {
                    return res.status(404).send({ status: 404, message: "Admin not found!" });
                }

                // Check if the user is an admin
                if (adminResult.role !== 'admin') {
                    return res.status(403).send({ status: 403, message: "Forbidden access, user is not an admin!" });
                }

                // Fetch all users from userCollection
                const allUsers = await userCollection.find({}).toArray();

                return res.status(200).send({
                    status: 200,
                    data: allUsers,
                    message: "All user details fetched successfully!"
                });

            } catch (error) {
                console.error('Failed to fetch user details:', error);
                return res.status(500).send({ status: 500, message: "Internal Server Error" });
            }
        });


        app.post('/users/delete_a_user_completely_with_no_rental_order', verifyJWT, async (req, res) => {
            try {
                const { adminEmail, targetUserId } = req.body;
                console.log(adminEmail, targetUserId)

                // Input validation
                if (!adminEmail || !targetUserId) {
                    return res.status(400).send({ status: 400, message: "Admin email or target user ID is missing!" });
                }

                // Verifying admin authenticity
                const { decoded_email } = req;
                if (adminEmail !== decoded_email) {
                    return res.status(403).send({ status: 403, message: "Forbidden access, email mismatch!" });
                }

                // Find the admin user
                const adminQuery = { email: adminEmail };
                const adminResult = await userCollection.findOne(adminQuery);
                if (!adminResult) {
                    return res.status(404).send({ status: 404, message: "Admin not found!" });
                }

                // Check if the user is an admin
                if (adminResult.role !== 'admin') {
                    return res.status(403).send({ status: 403, message: "Forbidden access, user is not an admin!" });
                }

                // Find the target user
                const targetUserQuery = { _id: new ObjectId(targetUserId) };
                const targetUserResult = await userCollection.findOne(targetUserQuery);
                if (!targetUserResult) {
                    return res.status(404).send({ status: 404, message: "Target user not found!" });
                }

                // Check if the target user has any active rentals
                if (targetUserResult.rentalOrders.length > 0) {
                    return res.status(400).send({ status: 400, message: "Cannot delete user with any existing rentals!" });
                }

                // Delete related documents from the messagesCollection
                const messageDeleteResult = await messagesCollection.deleteOne({ _id: new ObjectId(targetUserResult.messageChain_id) });
                if (messageDeleteResult.deletedCount === 0) {
                    return res.status(500).send({ status: 500, message: "Failed to delete user's message chain!" });
                }

                // Delete related documents from the notificationsCollection
                const notificationDeleteResult = await notificationsCollection.deleteOne({ _id: new ObjectId(targetUserResult.notificationChain_id) });
                if (notificationDeleteResult.deletedCount === 0) {
                    return res.status(500).send({ status: 500, message: "Failed to delete user's notification chain!" });
                }

                // Delete related documents from the activityHistoriesCollection
                const activityDeleteResult = await activityHistoriesCollection.deleteOne({ _id: new ObjectId(targetUserResult.activityHistoryChain_id) });
                if (activityDeleteResult.deletedCount === 0) {
                    return res.status(500).send({ status: 500, message: "Failed to delete user's activity history chain!" });
                }

                // Delete the target user from userCollection
                const userDeleteResult = await userCollection.deleteOne(targetUserQuery);
                if (userDeleteResult.deletedCount === 0) {
                    return res.status(500).send({ status: 500, message: "Failed to delete target user!" });
                }

                // Fetch all remaining users from userCollection
                const allUsers = await userCollection.find({}).toArray();

                return res.status(200).send({
                    status: 200,
                    data: allUsers,
                    message: "User and related data deleted successfully!"
                });

            } catch (error) {
                console.error('Failed to delete user:', error);
                return res.status(500).send({
                    status: 500,
                    message: "Internal Server Error",
                    error: error.message || "Unknown error occurred"
                });
            }
        });





        /*====================================== GADGETS COLLECTION ==================================================*/


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
                res.send({status: 200, data: gadgetResult, message: 'Gadget details by id fetched successfully!'});
            } else {
                res.send({status: 404, message: 'Failed to fetch Gadget details by id! Gadget not found!'});
            }
        });


        app.post("/gadgets/get_gadget_details_of_a_wishlist_array", verifyJWT, async (req, res) => {
            try {
                const { userEmail } = req.body;

                // Input validation
                if (!userEmail) {
                    return res.status(400).send({ status: 400, message: "userEmail is required!" });
                }

                // Verifying user authenticity
                const { decoded_email } = req;
                if (userEmail !== decoded_email) {
                    return res.status(403).send({ status: 403, message: "Forbidden access, email mismatch!" });
                }

                // Find the user
                const userQuery = { email: userEmail };
                const userResult = await userCollection.findOne(userQuery);
                if (!userResult) {
                    return res.status(404).send({ status: 404, message: "User not found!" });
                }

                // Get gadget IDs from wishlist
                const gadgetIdsArray = userResult.wishlist || [];
                if (gadgetIdsArray.length === 0) {
                    return res.send({ status: 200, data: [], message: "Wishlist is empty!" });
                }

                // Convert gadget IDs to ObjectId and fetch all gadgets in one query
                let gadgetObjectIds;
                try {
                    gadgetObjectIds = gadgetIdsArray.map(id => new ObjectId(id));
                } catch (error) {
                    return res.send({ status: 400, message: "Invalid gadget ID format in wishlist!" });
                }

                const gadgetQuery = { _id: { $in: gadgetObjectIds } };
                const gadgetObjectsArray = await gadgetsCollection.find(gadgetQuery).toArray();

                return res.send({
                    status: 200,
                    data: gadgetObjectsArray,
                    message: "Gadget details of wishlist fetched successfully!"
                });

            } catch (error) {
                console.error(error);
                return res.status(500).send({ status: 500, message: "Something went wrong!" });
            }
        });


        app.post('/gadgets/get_all_gadgets_with_full_details_for_admin', async (req, res) => {
            try {
                const { adminEmail } = req.body;

                // Input validation
                if (!adminEmail) {
                    return res.status(400).send({ status: 400, message: "Admin email is missing!" });
                }

                // Verifying admin authenticity
                /*const { decoded_email } = req;
                if (adminEmail !== decoded_email) {
                    return res.status(403).send({ status: 403, message: "Forbidden access, email mismatch!" });
                }*/

                // Find the admin user
                const adminQuery = { email: adminEmail };
                const adminResult = await userCollection.findOne(adminQuery);
                if (!adminResult) {
                    return res.status(404).send({ status: 404, message: "Admin not found!" });
                }

                // Check if the user is an admin
                if (adminResult.role !== 'admin') {
                    return res.status(403).send({ status: 403, message: "Forbidden access, user is not an admin!" });
                }

                // Fetch all gadgets from gadgetsCollection
                const allGadgets = await gadgetsCollection.find({}).toArray();

                return res.status(200).send({
                    status: 200,
                    data: allGadgets,
                    message: "All gadgets fetched successfully with full details for admin!"
                });

            } catch (error) {
                console.error('Failed to fetch gadgets:', error);
                return res.status(500).send({
                    status: 500,
                    message: "Internal Server Error",
                    error: error.message || "Unknown error occurred"
                });
            }
        });


        app.patch('/gadgets/update_the_details_of_a_gadget_by_admin', verifyJWT, async (req, res) => {
            try {
                const { adminEmail, updatedGadgetObject } = req.body;

                // Input validation
                if (!adminEmail || !updatedGadgetObject || !updatedGadgetObject._id) {
                    return res.status(400).send({ status: 400, message: "Admin email, gadget object, or gadget ID is missing!" });
                }

                // Verifying admin authenticity
                const { decoded_email } = req;
                if (adminEmail !== decoded_email) {
                    return res.status(403).send({ status: 403, message: "Forbidden access, email mismatch!" });
                }

                // Find the admin user
                const adminQuery = { email: adminEmail };
                const adminResult = await userCollection.findOne(adminQuery);
                if (!adminResult) {
                    return res.status(404).send({ status: 404, message: "Admin not found!" });
                }

                // Check if the user is an admin
                if (adminResult.role !== 'admin') {
                    return res.status(403).send({ status: 403, message: "Forbidden access, user is not an admin!" });
                }

                // Find the gadget document to update
                const gadgetQuery = { _id: new ObjectId(updatedGadgetObject._id) };
                const gadgetResult = await gadgetsCollection.findOne(gadgetQuery);
                if (!gadgetResult) {
                    return res.status(404).send({ status: 404, message: "Gadget not found!" });
                }

                // Prepare the fields to update (excluding _id)
                const updateFields = {};
                for (const key in updatedGadgetObject) {
                    if (key !== '_id') {
                        updateFields[key] = updatedGadgetObject[key];
                    }
                }

                // Update the gadget document
                const updateResult = await gadgetsCollection.updateOne(
                    gadgetQuery,
                    { $set: updateFields }
                );

                if (updateResult.modifiedCount === 0) {
                    return res.status(500).send({ status: 500, message: "Failed to update gadget!" });
                }

                // Fetch all gadgets from gadgetsCollection
                const allGadgets = await gadgetsCollection.find({}).toArray();

                return res.status(200).send({
                    status: 200,
                    data: allGadgets,
                    message: "Gadget updated successfully and all gadgets fetched!"
                });

            } catch (error) {
                console.error('Failed to update gadget:', error);
                return res.status(500).send({
                    status: 500,
                    message: "Internal Server Error",
                    error: error.message || "Unknown error occurred"
                });
            }
        });


        app.post('/gadgets/add_new_gadget_with_details_by_admin', verifyJWT, async (req, res) => {
            try {
                const { adminEmail, newGadgetDetailsObject } = req.body;

                // Input validation
                if (!adminEmail || !newGadgetDetailsObject) {
                    return res.status(400).send({ status: 400, message: "Admin email or new gadget details is missing!" });
                }

                // Verifying admin authenticity
                const { decoded_email } = req;
                if (adminEmail !== decoded_email) {
                    return res.status(403).send({ status: 403, message: "Forbidden access, email mismatch!" });
                }

                // Find the admin user
                const adminQuery = { email: adminEmail };
                const adminResult = await userCollection.findOne(adminQuery);
                if (!adminResult) {
                    return res.status(404).send({ status: 404, message: "Admin not found!" });
                }

                // Check if the user is an admin
                if (adminResult.role !== 'admin') {
                    return res.status(403).send({ status: 403, message: "Forbidden access, user is not an admin!" });
                }

                // Insert the new gadget into gadgetsCollection
                const insertResult = await gadgetsCollection.insertOne(newGadgetDetailsObject);
                if (!insertResult.insertedId) {
                    return res.status(500).send({ status: 500, message: "Failed to add new gadget!" });
                }

                // Fetch all gadgets from gadgetsCollection
                const allGadgets = await gadgetsCollection.find({}).toArray();

                return res.status(201).send({
                    status: 201,
                    data: allGadgets,
                    message: "New gadget added successfully and all gadgets fetched!"
                });

            } catch (error) {
                console.error('Failed to add new gadget:', error);
                return res.status(500).send({
                    status: 500,
                    message: "Internal Server Error",
                    error: error.message || "Unknown error occurred"
                });
            }
        });





        /*==================================== RENTAL ORDERS COLLECTION ==============================================*/


        /* CREATING (IF NOT PRESENT) / CONNECTING THE COLLECTION NAMED "rentalOrdersCollection" AND ACCESS IT */
        const rentalOrdersCollection = database.collection("rentalOrdersCollection");


        app.post('/rental_orders/add_new_rental_order_from_a_user', verifyJWT, async (req, res) => {
            try {
                const { userEmail, newRentalOrderObj } = req.body;

                // Input validation
                if (!userEmail || !newRentalOrderObj) {
                    return res.status(400).send({ status: 400, message: "User email, gadget ID, or rental order info is missing!" });
                }

                // Verifying user authenticity
                const { decoded_email } = req;
                if (userEmail !== decoded_email) {
                    return res.status(403).send({ status: 403, message: "Forbidden access, email mismatch!" });
                }

                // Find the user
                const userQuery = { email: userEmail };
                const userResult = await userCollection.findOne(userQuery);
                if (!userResult) {
                    return res.status(404).send({ status: 404, message: "User not found!" });
                }

                // Insert new rental order into rentalOrdersCollection
                const rentalOrderResult = await rentalOrdersCollection.insertOne(newRentalOrderObj);
                if (!rentalOrderResult.insertedId) {
                    return res.status(500).send({ status: 500, message: "Failed to create rental order!" });
                }

                // Add rental order ID to the user's rentalOrders array as a string
                // Increment user's active rental order count and add pointsEarned to stats.pointsEarned
                const pointsEarned = newRentalOrderObj?.rentalStreak[newRentalOrderObj?.rentalStreak?.length - 1]?.pointsEarned;
                const moneySpend = newRentalOrderObj?.rentalStreak[newRentalOrderObj?.rentalStreak?.length - 1]?.payableFinalAmount;
                const rentalDaysCount = newRentalOrderObj?.rentalStreak[newRentalOrderObj?.rentalStreak?.length - 1]?.rentalDuration;
                const userUpdateResult = await userCollection.updateOne(
                    userQuery,
                    {
                        $push: { rentalOrders: rentalOrderResult.insertedId.toString() },
                        $inc: {
                            "stats.activeRentals": 1,
                            "membershipDetails.points": pointsEarned,
                            "stats.pointsEarned": pointsEarned,
                            "stats.totalSpent": moneySpend,
                            "membershipDetails.rentalStreak": rentalDaysCount,
                        }
                    }
                );

                if (userUpdateResult.modifiedCount === 0) {
                    // Rollback: Delete the rental order if the user update fails
                    await rentalOrdersCollection.deleteOne({ _id: rentalOrderResult.insertedId });
                    return res.status(500).send({ status: 500, message: "Failed to update user's rental orders!" });
                }

                // Find the gadget
                const gadgetQuery = { _id: new ObjectId(newRentalOrderObj?.gadget_id) };
                const gadgetResult = await gadgetsCollection.findOne(gadgetQuery);
                if (!gadgetResult) {
                    // Rollback: Delete the rental order and remove from user's rentalOrders
                    await rentalOrdersCollection.deleteOne({ _id: rentalOrderResult.insertedId });
                    await userCollection.updateOne(userQuery, { $pull: { rentalOrders: rentalOrderResult.insertedId.toString() } });
                    return res.status(404).send({ status: 404, message: "Gadget not found!" });
                }

                // Get new blocked dates from newRentalOrderObj
                const newBlockedDates = newRentalOrderObj?.blockedDates;

                if (newBlockedDates.length > 0) {
                    // Update gadget's availability.blockedDates, allowing duplicates
                    const gadgetUpdateResult = await gadgetsCollection.updateOne(
                        gadgetQuery,
                        { $push: { 'availability.blockedDates': { $each: newBlockedDates } } }
                    );

                    if (gadgetUpdateResult.modifiedCount === 0) {
                        // Rollback: Delete the rental order and remove from user's rentalOrders
                        await rentalOrdersCollection.deleteOne({ _id: rentalOrderResult.insertedId });
                        await userCollection.updateOne(userQuery, { $pull: { rentalOrders: rentalOrderResult.insertedId.toString() } });
                        return res.status(500).send({ status: 500, message: "Failed to update gadget's blocked dates!" });
                    }
                }

                // Fetch the newly created rental order
                const newRentalOrder = await rentalOrdersCollection.findOne({ _id: rentalOrderResult.insertedId });

                return res.status(201).send({
                    status: 201,
                    data: newRentalOrder,
                    message: "Rental order created and gadget availability updated successfully!"
                });

            } catch (error) {
                console.error('Failed to create rental order:', error);
                return res.status(500).send({ status: 500, message: "Internal Server Error" });
            }
        });


        app.post('/rental_orders/get_all_rental_orders_of_a_user', verifyJWT, async (req, res) => {
            try {
                const { userEmail } = req.body;

                // Input validation
                if (!userEmail) {
                    return res.status(400).send({ status: 400, message: "User email is missing!" });
                }

                // Verifying user authenticity
                const { decoded_email } = req;
                if (userEmail !== decoded_email) {
                    return res.status(403).send({ status: 403, message: "Forbidden access, email mismatch!" });
                }

                // Find the user
                const userQuery = { email: userEmail };
                const userResult = await userCollection.findOne(userQuery);
                if (!userResult) {
                    return res.status(404).send({ status: 404, message: "User not found!" });
                }

                // Get rental order IDs from user's rentalOrders array
                const rentalOrderIds = userResult.rentalOrders;

                // Fetch full rental order documents from rentalOrdersCollection
                const rentalOrders = await rentalOrdersCollection
                    .find({
                        _id: { $in: rentalOrderIds.map(id => new ObjectId(id)) }
                    })
                    .toArray();

                return res.status(200).send({
                    status: 200,
                    data: rentalOrders,
                    message: "User rental orders fetched successfully!"
                });

            } catch (error) {
                console.error('Failed to fetch user rental orders:', error);
                return res.status(500).send({ status: 500, message: "Internal Server Error" });
            }
        });


        app.post('/rental_orders/get_full_details_of_all_rental_orders_for_admin', async (req, res) => {
            try {
                const { adminEmail } = req.body;

                // Input validation
                if (!adminEmail) {
                    return res.status(400).send({ status: 400, message: "Admin email is missing!" });
                }

                // Verifying admin authenticity
                /*const { decoded_email } = req;
                if (adminEmail !== decoded_email) {
                    return res.status(403).send({ status: 403, message: "Forbidden access, email mismatch!" });
                }*/

                // Find the admin user
                const adminQuery = { email: adminEmail };
                const adminResult = await userCollection.findOne(adminQuery);
                if (!adminResult) {
                    return res.status(404).send({ status: 404, message: "Admin not found!" });
                }

                // Check if the user is an admin
                if (adminResult.role !== 'admin') {
                    return res.status(403).send({ status: 403, message: "Forbidden access, user is not an admin!" });
                }

                // Fetch all rental orders except those where customerDetails.email matches adminEmail
                const rentalOrders = await rentalOrdersCollection
                    .find({ "customerDetails.email": { $ne: adminEmail } })
                    .toArray();

                return res.status(200).send({
                    status: 200,
                    data: rentalOrders,
                    message: "All rental orders fetched successfully!"
                });

            } catch (error) {
                console.error('Failed to fetch rental orders:', error);
                return res.status(500).send({
                    status: 500,
                    message: "Internal Server Error",
                    error: error.message || "Unknown error occurred"
                });
            }
        });


        app.patch('/rental_orders/update_the_details_of_a_rental_orders_by_admin', verifyJWT, async (req, res) => {
            try {
                const { adminEmail, updatedRentalOrderObj } = req.body;

                // Input validation
                if (!adminEmail || !updatedRentalOrderObj || !updatedRentalOrderObj._id) {
                    return res.status(400).send({ status: 400, message: "Admin email, rental order object, or rental order ID is missing!" });
                }

                // Verifying admin authenticity
                const { decoded_email } = req;
                if (adminEmail !== decoded_email) {
                    return res.status(403).send({ status: 403, message: "Forbidden access, email mismatch!" });
                }

                // Find the admin user
                const adminQuery = { email: adminEmail };
                const adminResult = await userCollection.findOne(adminQuery);
                if (!adminResult) {
                    return res.status(404).send({ status: 404, message: "Admin not found!" });
                }

                // Check if the user is an admin
                if (adminResult.role !== 'admin') {
                    return res.status(403).send({ status: 403, message: "Forbidden access, user is not an admin!" });
                }

                // Find the rental order document to update
                const rentalOrderQuery = { _id: new ObjectId(updatedRentalOrderObj._id) };
                const rentalOrderResult = await rentalOrdersCollection.findOne(rentalOrderQuery);
                if (!rentalOrderResult) {
                    return res.status(404).send({ status: 404, message: "Rental order not found!" });
                }

                // Prepare the fields to update (excluding _id)
                const updateFields = {};
                for (const key in updatedRentalOrderObj) {
                    if (key !== '_id') {
                        updateFields[key] = updatedRentalOrderObj[key];
                    }
                }

                // TODO: If the shipmentStatus=return_received, make rentalStatus=completed
                // TODO: If the rentalStatus=canceled, make rentalStatus=""

                // Update the rental order document
                const updateResult = await rentalOrdersCollection.updateOne(
                    rentalOrderQuery,
                    { $set: updateFields }
                );

                if (updateResult.modifiedCount === 0) {
                    //return res.status(500).send({ status: 500, message: "Failed to update rental order!" });
                }

                // Fetch all rental orders except those where customerDetails.email matches adminEmail
                const rentalOrders = await rentalOrdersCollection
                    .find({ "customerDetails.email": { $ne: adminEmail } })
                    .toArray();

                return res.status(200).send({
                    status: 200,
                    data: rentalOrders,
                    message: "Rental order updated successfully and all rental orders fetched!"
                });

            } catch (error) {
                console.error('Failed to update rental order:', error);
                return res.status(500).send({
                    status: 500,
                    message: "Internal Server Error",
                    error: error.message || "Unknown error occurred"
                });
            }
        });





        /*====================================== MESSAGES COLLECTION =================================================*/


        /* CREATING (IF NOT PRESENT) / CONNECTING THE COLLECTION NAMED "messagesCollection" AND ACCESS IT */
        const messagesCollection = database.collection("messagesCollection");


        app.post('/messages/get_all_messages_of_a_user', verifyJWT, async (req, res) => {
            try {
                const { userEmail } = req.body;

                // Input validation
                if (!userEmail) {
                    return res.status(400).send({ status: 400, message: "User email is missing!" });
                }

                // Verifying user authenticity
                const { decoded_email } = req;
                if (userEmail !== decoded_email) {
                    return res.status(403).send({ status: 403, message: "Forbidden access, email mismatch!" });
                }

                // Find the user's message chain
                const messageChainQuery = { user_email: userEmail };
                const messageChainResult = await messagesCollection.findOne(messageChainQuery);

                // If a message chain not found
                if (!messageChainResult) {
                    return res.status(404).send({ status: 404, message: "Message chain not found!" });
                }

                // Return the whole message chain
                return res.send({status: 200, data: messageChainResult, message: "Messages fetched successfully!"});

            } catch (error) {
                console.error('Failed to fetch messages! :', error);
                return res.send({ status: 500, message: "Failed to fetch messages!" });
            }
        });


        app.post('/messages/add_new_message_from_a_user', verifyJWT, async (req, res) => {
            try {
                const { userEmail, newMessageObj } = req.body;

                // Input validation
                if (!userEmail || !newMessageObj) {
                    return res.status(400).send({ status: 400, message: "User email or message is missing!" });
                }
                if (!newMessageObj.sender || !['admin', 'user'].includes(newMessageObj.sender)) {
                    return res.status(400).send({ status: 400, message: "Invalid sender value!" });
                }

                // Verifying user authenticity
                const { decoded_email } = req;
                if (userEmail !== decoded_email) {
                    return res.status(403).send({ status: 403, message: "Forbidden access, email mismatch!" });
                }

                // Find the user's message chain
                const messageChainQuery = { user_email: userEmail };
                const messageChainResult = await messagesCollection.findOne(messageChainQuery);

                // If a message chain not found
                if (!messageChainResult) {
                    return res.status(404).send({ status: 404, message: "Message chain not found!" });
                }

                // Prepare update operation
                let updateOperations;
                const operationsCombination1 = {
                    $push: { message_chain: newMessageObj },
                    $set: {
                        unreadByUser_count: 0
                    },
                    $inc: {
                        unreadByAdmin_count: 1,
                        total_count: 1
                    }
                };
                const operationsCombination2 = {
                    $push: { message_chain: newMessageObj },
                    $inc: {
                        total_count: 1
                    }
                };

                // Set updateOperations based on sender
                if (newMessageObj.sender === 'user') {updateOperations = operationsCombination1;
                } else if (newMessageObj.sender === 'admin') {updateOperations = operationsCombination2;
                } else {
                    // This case is already handled by the sender validation above, but adding for clarity
                    return res.status(400).send({ status: 400, message: "Invalid sender value!" });
                }

                // Update message chain
                const updateResult = await messagesCollection.updateOne(messageChainQuery, updateOperations);
                const postUpdateMessageChainResult = await messagesCollection.findOne(messageChainQuery);

                // Check if the update was successful
                if (updateResult.modifiedCount === 0) {
                    return res.send({ status: 500, message: "Failed to add new message!" });
                }

                return res.send({status: 200, data: postUpdateMessageChainResult, message: "New message added successfully!"});

            } catch (error) {
                console.error('Failed to add new message from a user! :', error);
                return res.send({ status: 500, message: "Failed to add new message from a user!" });
            }
        });


        app.post('/messages/get_all_messages_of_all_users_for_admin', verifyJWT, async (req, res) => {
            try {
                const { adminEmail } = req.body;

                // Input validation
                if (!adminEmail) {
                    return res.status(400).send({ status: 400, message: "Admin email is missing!" });
                }

                // Verifying admin authenticity
                const { decoded_email } = req;
                if (adminEmail !== decoded_email) {
                    return res.status(403).send({ status: 403, message: "Forbidden access, admin email mismatch!" });
                }

                // Find the admin
                const adminQuery = { email: adminEmail };
                const adminResult = await userCollection.findOne(adminQuery);
                if (!adminResult) {
                    return res.status(404).send({ status: 404, message: "Admin not found!" });
                }

                // Check if it is really an admin
                if (adminResult.role !== 'admin') {
                    return res.status(403).send({ status: 403, message: "Forbidden access, it is not an admin!" });
                }

                // Get all messages from messagesCollection
                const allMessages = await messagesCollection.find({}).toArray();

                return res.status(200).send({
                    status: 200,
                    data: allMessages,
                    message: "All messages fetched successfully for admin!"
                });

            } catch (error) {
                console.error('Failed to fetch all messages for admin:', error);
                return res.status(500).send({ status: 500, message: "Internal Server Error" });
            }
        });


        app.patch('/messages/add_new_message_from_admin_to_a_user', verifyJWT, async (req, res) => {
            try {
                const { adminEmail, targetUserId, newMessageObjFromAdmin } = req.body;

                // Input validation
                if (!adminEmail || !targetUserId || !newMessageObjFromAdmin) {
                    return res.status(400).send({ status: 400, message: "Admin email, target user ID, or new message is missing!" });
                }

                // Verifying admin authenticity
                const { decoded_email } = req;
                if (adminEmail !== decoded_email) {
                    return res.status(403).send({ status: 403, message: "Forbidden access, email mismatch!" });
                }

                // Find the admin user
                const adminQuery = { email: adminEmail };
                const adminResult = await userCollection.findOne(adminQuery);
                if (!adminResult) {
                    return res.status(404).send({ status: 404, message: "Admin not found!" });
                }

                // Check if the user is an admin
                if (adminResult.role !== 'admin') {
                    return res.status(403).send({ status: 403, message: "Forbidden access, it's not an admin!" });
                }

                // Find the message document for the target user in messagesCollection
                const messageQuery = { _id: new ObjectId(targetUserId) };
                const messageDoc = await messagesCollection.findOne(messageQuery);
                if (!messageDoc) {
                    return res.status(404).send({ status: 404, message: "Message chain for target user not found!" });
                }

                // Update the message document: push the new message to message_chain and increment unreadByUser_count
                const updateResult = await messagesCollection.updateOne(
                    messageQuery,
                    {
                        $push: {message_chain: newMessageObjFromAdmin},
                        $set: {
                            unreadByAdmin_count: 0
                        },
                        $inc: {
                            unreadByUser_count: 1,
                            total_count: 1
                        }
                    }
                );

                if (updateResult.modifiedCount === 0) {
                    return res.status(500).send({ status: 500, message: "Failed to add new message!" });
                }

                // Fetch all messages from messagesCollection
                const allMessages = await messagesCollection.find({}).toArray();

                return res.status(200).send({
                    status: 200,
                    data: allMessages,
                    message: "New message added successfully and all messages fetched!"
                });

            } catch (error) {
                console.error('Failed to add message:', error);
                return res.status(500).send({ status: 500, message: "Internal Server Error" });
            }
        });


        app.patch('/messages/a_users_message_chain_is_marked_as_read_by_admin', verifyJWT, async (req, res) => {
            try {
                const { adminEmail, targetUserEmail } = req.body;

                // Input validation
                if (!adminEmail || !targetUserEmail) {
                    return res.status(400).send({ status: 400, message: "Admin email or target user email is missing!" });
                }

                // Verifying admin authenticity
                const { decoded_email } = req;
                if (adminEmail !== decoded_email) {
                    return res.status(403).send({ status: 403, message: "Forbidden access, email mismatch!" });
                }

                // Find the admin user
                const adminQuery = { email: adminEmail };
                const adminResult = await userCollection.findOne(adminQuery);
                if (!adminResult) {
                    return res.status(404).send({ status: 404, message: "Admin not found!" });
                }

                // Check if the user is an admin
                if (adminResult.role !== 'admin') {
                    return res.status(403).send({ status: 403, message: "Forbidden access, user is not an admin!" });
                }

                // Find the message document for the target user in messagesCollection
                const messageQuery = { user_email: targetUserEmail };
                const messageDoc = await messagesCollection.findOne(messageQuery);
                if (!messageDoc) {
                    return res.status(404).send({ status: 404, message: "Message chain for target user not found!" });
                }

                // Update the message document: set unreadByAdmin_count to 0
                const updateResult = await messagesCollection.updateOne(
                    messageQuery,
                    { $set: { unreadByAdmin_count: 0 } }
                );

                if (updateResult.modifiedCount === 0) {
                    // return res.status(500).send({ status: 500, message: "Failed to mark messages as read by admin!" });
                }

                // Fetch all messages from messagesCollection
                const allMessages = await messagesCollection.find({}).toArray();

                return res.status(200).send({
                    status: 200,
                    data: allMessages,
                    message: "Messages marked as read by admin and all messages fetched!"
                });

            } catch (error) {
                console.error('Failed to mark messages as read by admin:', error);
                return res.status(500).send({ status: 500, message: "Internal Server Error" });
            }
        });


        app.patch('/messages/a_users_message_chain_is_marked_as_read_by_user', verifyJWT, async (req, res) => {
            try {
                const { userEmail } = req.body;

                // Input validation
                if (!userEmail) {
                    return res.status(400).send({ status: 400, message: "User email is missing!" });
                }

                // Verifying user authenticity
                const { decoded_email } = req;
                if (userEmail !== decoded_email) {
                    return res.status(403).send({ status: 403, message: "Forbidden access, email mismatch!" });
                }

                // Find the user
                const userQuery = { email: userEmail };
                const userResult = await userCollection.findOne(userQuery);
                if (!userResult) {
                    return res.status(404).send({ status: 404, message: "User not found!" });
                }

                // Check if the role is user
                if (userResult.role !== 'user') {
                    return res.status(403).send({ status: 403, message: "Forbidden access, role is not user!" });
                }

                // Find the message document in messagesCollection
                const messageQuery = { user_email: userEmail };
                const messageDoc = await messagesCollection.findOne(messageQuery);
                if (!messageDoc) {
                    return res.status(404).send({ status: 404, message: "Message chain for user not found!" });
                }

                // Update the message document: set unreadByUser_count to 0
                const updateResult = await messagesCollection.updateOne(
                    messageQuery,
                    { $set: { unreadByUser_count: 0 } }
                );

                if (updateResult.modifiedCount === 0) {
                    // return res.status(500).send({ status: 500, message: "Failed to mark messages as read by user!" });
                }

                // Fetch updated message document
                const updatedMessageChainResult = await messagesCollection.findOne(messageQuery);

                return res.status(200).send({
                    status: 200,
                    data: updatedMessageChainResult,
                    message: "Messages marked as read by user successfully!"
                });

            } catch (error) {
                console.error('Failed to mark messages as read by user:', error);
                return res.status(500).send({ status: 500, message: "Internal Server Error" });
            }
        });





        /*==================================== NOTIFICATIONS COLLECTION ==============================================*/


        /* CREATING (IF NOT PRESENT) / CONNECTING THE COLLECTION NAMED "notificationsCollection" AND ACCESS IT */
        const notificationsCollection = database.collection("notificationsCollection");





        /*================================= ACTIVITY HISTORIES COLLECTION ============================================*/


        /* CREATING (IF NOT PRESENT) / CONNECTING THE COLLECTION NAMED "activityHistoriesCollection" AND ACCESS IT */
        const activityHistoriesCollection = database.collection("activityHistoriesCollection");





        /*================================== NEWSLETTER EMAIL COLLECTION =============================================*/


        /* CREATING (IF NOT PRESENT) / CONNECTING THE COLLECTION NAMED "newsletterEmailCollection" AND ACCESS IT */
        const newsletterEmailCollection = database.collection("newsletterEmailCollection");


        /* VERIFY JWT MIDDLEWARE WILL NOT WORK HERE, USER MAY UNAVAILABLE */
        app.post('/add_this_email_for_newsletter', async (req, res) => {
            try {
                const { visitorEmail } = req.body;

                // Input validation
                if (!visitorEmail) {
                    return res.status(400).send({ status: 400, message: "Visitor email is missing!" });
                }

                // Check if email already exists in the newsletterEmailCollection
                const emailQuery = { email: visitorEmail };
                const emailExists = await newsletterEmailCollection.findOne(emailQuery);

                if (emailExists) {
                    return res.status(200).send({
                        status: 200,
                        message: "This email is already subscribed to the newsletter!"
                    });
                }

                // Save the email to newsletterEmailCollection
                const insertResult = await newsletterEmailCollection.insertOne({ email: visitorEmail });
                if (!insertResult.insertedId) {
                    return res.status(500).send({ status: 500, message: "Failed to subscribe email to newsletter!" });
                }

                return res.status(201).send({
                    status: 201,
                    message: "Email successfully subscribed to the newsletter!"
                });

            } catch (error) {
                console.error('Failed to process newsletter subscription:', error);
                return res.status(500).send({ status: 500, message: "Internal Server Error" });
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
It logs a message in the console indicating the app is running and the port it's listening to on. */
app.listen(port, () => {
    console.log(`GadgetSwap Rental Marketplace Application listening on port ${port}`);
})
