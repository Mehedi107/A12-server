import express, { json } from 'express';
import 'dotenv/config';
import cors from 'cors';
import { MongoClient, ObjectId, ServerApiVersion } from 'mongodb';
import jwt, { decode } from 'jsonwebtoken';

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(json());

const verifyToken = (req, res, next) => {
  if (!req.headers.authorization) {
    return res.status(401).send({ message: 'forbidden access' });
  }

  const token = req.headers.authorization.split(' ')[1];
  jwt.verify(token, process.env.SECRET_KEY, (err, decoded) => {
    if (err) {
      return res.status(401).send({ message: 'forbidden access' });
    }

    req.user = decoded;
    next();
  });
};

const uri = `mongodb+srv://${process.env.USER_NAME}:${process.env.PASSWORD}@cluster0.blfnk.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    // Connect the client to the server (optional starting in v4.7)
    await client.connect();
    // Send a ping to confirm a successful connection
    await client.db('admin').command({ ping: 1 });
    console.log(
      'Pinged your deployment. You successfully connected to MongoDB!'
    );

    const database = client.db('ProdVent');
    const productsColl = database.collection('products');
    const usersColl = database.collection('users');
    const reviewsColl = database.collection('reviews');
    const couponColl = database.collection('coupons');

    // Create JWT token
    app.post('/jwt', async (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.SECRET_KEY, {
        expiresIn: '365d',
      });
      res.send({ token });
    });

    // Get 4 feature product
    app.get('/products/featured', async (req, res) => {
      try {
        const filteredProduct = await productsColl
          .find({ type: 'featured' }) // Find only featured product
          .sort({ timestamp: -1 }) // Sort by latest/descending order
          .limit(4) // Get only latest 4 product
          .toArray();
        res.send(filteredProduct);
      } catch (error) {
        res.status(500).send({ message: 'Failed to fetch products', error });
      }
    });

    // Get 6 trending product
    app.get('/trending-product', async (req, res) => {
      try {
        const productAll = await productsColl
          .find()
          .sort({ vote: -1 }) // Sort by most upvoted/descending order
          .limit(6)
          .toArray();
        res.send(productAll);
      } catch (error) {
        res.status(500).send('Failed to fetch trending products');
      }
    });

    // Get all product data from DB
    app.get('/all-products', async (req, res) => {
      try {
        const productAll = await productsColl.find().toArray();
        res.send(productAll);
      } catch (error) {
        // console.log(error);
        res.status(500).send('Failed to fetch all products');
      }
    });

    // Get product details and review data by ID
    app.get('/product/details/:id', async (req, res) => {
      try {
        const id = req.params.id;
        // Get query for product details
        const productQuery = { _id: new ObjectId(id) };
        const product = await productsColl.findOne(productQuery);
        res.send(product);
      } catch (error) {
        // console.log(error);
        res.status(500).send('Failed to fetch product details');
      }
    });

    // Get all reviews by product ID
    app.get('/product/:id/reviews', async (req, res) => {
      try {
        const id = req.params.id;
        const reviews = await reviewsColl.find({ productId: id }).toArray();
        res.send(reviews);
      } catch (error) {
        // console.log(error);
        res.status(500).send('Failed to fetch reviews');
      }
    });

    // Upvote product
    app.patch('/product/upvote/:id', async (req, res) => {
      try {
        const id = req.params.id;
        const email = req.body.user;
        const query = { _id: new ObjectId(id) };

        const product = await productsColl.findOne(query);
        const options = { upsert: true };

        let updateDoc;

        if (product.likedUsers.includes(email)) {
          updateDoc = {
            $inc: { vote: -1 },
            $pull: { likedUsers: email },
          };
        } else {
          updateDoc = {
            $inc: { vote: 1 },
            $addToSet: { likedUsers: email },
          };
        }

        const result = await productsColl.updateOne(query, updateDoc, options);

        if (result.modifiedCount === 0) {
          return res.status(500).json({ message: 'Failed to update vote' });
        }

        const updatedProduct = await productsColl.findOne(query);
        res.json({ message: 'Vote updated', product: updatedProduct });
      } catch (error) {
        res.status(500).send('Failed to upvote product');
      }
    });

    // Update reported product
    app.patch('/product/report/:id', async (req, res) => {
      try {
        const id = req.params.id;
        const email = req.body.user;
        // console.log(email);
        const query = { _id: new ObjectId(id) };

        const product = await productsColl.findOne(query);
        // console.log(product);
        const options = { upsert: true };

        let updateDoc;

        if (product.reportedBy.includes(email)) {
          updateDoc = {
            $inc: { report: -1 },
            $pull: { reportedBy: email },
          };
        } else {
          updateDoc = {
            $inc: { report: 1 },
            $addToSet: { reportedBy: email },
          };
        }

        const result = await productsColl.updateOne(query, updateDoc, options);

        if (result.modifiedCount === 0) {
          return res.status(500).json({ message: 'Failed to update report' });
        }

        const updatedProduct = await productsColl.findOne(query);
        res.json({ message: 'Report updated', product: updatedProduct });
      } catch (error) {
        // console.log(error);
        res.status(500).send('Failed to report product');
      }
    });

    // Save review
    app.post('/product/:id/reviews', async (req, res) => {
      try {
        const id = req.params.id;
        const review = req.body;

        // Check if user already reviewed this product
        const filterReview = await reviewsColl.findOne({ email: review.email });

        if (filterReview) {
          return res.send('already reviewed');
        }

        // Create a new review
        const doc = {
          email: review.email,
          name: review.name,
          photo: review.photo,
          rating: review.rating,
          review: review.reviewDescription,
          productId: id,
        };

        const result = await reviewsColl.insertOne(doc);
        return res.send(result);
      } catch (error) {
        res.status(500).send('Failed to add review');
      }
    });

    // Save user data to DB
    app.post('/user', async (req, res) => {
      try {
        const user = req.body;

        // Check if user already exists
        const isUserExist = await usersColl.findOne({ email: user.email });
        if (isUserExist) return res.send('User already exists');

        // Save user data
        const result = await usersColl.insertOne(user);
        res.send(result);
      } catch (error) {
        // console.log(error);
        res.status(500).send('Failed to save user');
      }
    });

    // Get user data by email
    app.get('/user/:email', async (req, res) => {
      try {
        const email = req.params.email;
        const user = await usersColl.findOne({
          email: email,
        });
        res.send(user);
      } catch (error) {
        // console.log(error);
        res.status(500).send('Failed to fetch user');
      }
    });

    // Verify user payment
    app.patch('/user/verify/:email', async (req, res) => {
      try {
        const email = req.params.email;
        const query = { email: email };
        const options = { upsert: true };
        const updateDoc = {
          $set: { status: 'verified' },
        };
        const result = await usersColl.updateOne(query, updateDoc, options);
        res.send(result);
      } catch (error) {
        // console.log(error);
        res.status(500).send('Failed to verify user');
      }
    });

    // Add product
    app.post('/add-product', async (req, res) => {
      try {
        const {
          productName,
          productImage,
          productDescription,
          userEmail,
          externalLink,
          tags,
        } = req.body;

        // Validate required fields
        if (
          !productName ||
          !productImage ||
          !productDescription ||
          !userEmail
        ) {
          return res.status(400).json({ message: 'Missing required fields' });
        }

        const newProduct = {
          name: productName,
          image: productImage,
          description: productDescription,
          tags: tags || [],
          externalLink: externalLink || '',
          vote: 0,
          likedUsers: [],
          addedBy: userEmail,
          timestamp: new Date(),
          report: 0,
          reportedBy: [],
          status: 'pending',
          type: 'regular',
        };

        const result = await productsColl.insertOne(newProduct);
        res.send(result);
      } catch (error) {
        res.status(500).send({ message: 'Failed to save product', error });
      }
    });

    // Get product by user email
    app.get('/my-product/:email', verifyToken, async (req, res) => {
      try {
        const decodedEmail = req?.user?.email;
        const email = req.params.email;

        // Verify user
        if (email !== decodedEmail) {
          return res.status(401).send({ message: 'Unauthorize access' });
        }

        const query = { addedBy: email };
        const products = await productsColl.find(query).toArray();
        res.send(products);
      } catch (error) {
        // console.log(error);
        res.status(500).send('Failed to fetch my products');
      }
    });

    // delete product by Id
    app.delete('/delete-product/:id', async (req, res) => {
      try {
        const id = req.params.id;
        const query = { _id: new ObjectId(id) };
        const result = await productsColl.deleteOne(query);
        res.send(result);
      } catch (error) {
        // console.log(error);
        res.status(500).send('Failed to delete my products');
      }
    });

    // Get product by id
    app.get('/product/:id', async (req, res) => {
      try {
        const id = req.params.id;
        const query = { _id: new ObjectId(id) };
        const result = await productsColl.findOne(query);
        res.send(result);
      } catch (error) {
        // console.log(error);
        res.status(500).send('Error fetching product');
      }
    });

    // Update product by id
    app.patch('/update-product/:id', async (req, res) => {
      try {
        const id = req.params.id;
        const query = { _id: new ObjectId(id) };
        const product = req.body;
        const updateProduct = {
          $set: {
            name: product.productName,
            image: product.productImage,
            description: product.productDescription,
            tags: product.tags,
            externalLink: product.externalLink,
            timestamp: new Date(),
          },
        };
        const result = await productsColl.updateOne(query, updateProduct);
        res.send(result);
      } catch (error) {
        // console.log(error);
        res.status(500).send('Error updating');
      }
    });

    // Change status of product (Accepted)
    app.patch('/accept-product/:id', async (req, res) => {
      try {
        const id = req.params.id;
        const query = { _id: new ObjectId(id) };
        const options = { upsert: true };
        const updateDoc = {
          $set: {
            status: 'accepted',
          },
        };
        const result = await productsColl.updateOne(query, updateDoc, options);
        res.send(result);
      } catch (error) {
        // console.log(error);
        res.status(500).send('Error updating');
      }
    });

    // Change status of product (Rejected)
    app.patch('/reject-product/:id', async (req, res) => {
      try {
        const id = req.params.id;
        const query = { _id: new ObjectId(id) };
        const options = { upsert: true };
        const updateDoc = {
          $set: {
            status: 'rejected',
          },
        };
        const result = await productsColl.updateOne(query, updateDoc, options);
        res.send(result);
      } catch (error) {
        // console.log(error);
        res.status(500).send('Error updating');
      }
    });

    // Make product type featured
    app.patch('/featured/:id', async (req, res) => {
      try {
        const id = req.params.id;
        const query = { _id: new ObjectId(id) };
        const options = { upsert: true };
        const updateDoc = {
          $set: {
            type: 'featured',
          },
        };
        const result = await productsColl.updateOne(query, updateDoc, options);
        res.send(result);
      } catch (error) {
        // console.log(error);
        res.status(500).send('Error updating');
      }
    });

    // Get reported product
    app.get('/reported', async (req, res) => {
      try {
        const decodedEmail = req?.user?.email;
        const email = req.params.email;

        // Verify email
        if (email !== decodedEmail) {
          return res.status(401).send({ message: 'Unauthorize access' });
        }

        const query = { report: { $gt: 0 } };
        const sortProduct = await productsColl.find(query).toArray();
        res.send(sortProduct);
      } catch (error) {
        // console.log(error);
        res.status(500).send('Failed to fetch all products');
      }
    });

    // Get all users
    app.get('/users', verifyToken, async (req, res) => {
      try {
        const userAll = await usersColl.find().toArray();
        res.send(userAll);
      } catch (error) {
        // console.log(error);
        res.status(500).send('Failed to fetch all users');
      }
    });

    // Update user role
    app.patch('/users/:email/role', async (req, res) => {
      try {
        const email = req.params.email;
        const { role } = req.body;
        const query = { email: email };
        const options = { upsert: true };
        const updateDoc = {
          $set: {
            role: role,
          },
        };
        const result = await usersColl.updateOne(query, updateDoc, options);
        res.send(result);
      } catch (error) {
        // console.log(error);
        res.status(500).send('Failed to update user role');
      }
    });

    // Get all product review
    app.get('/reviews', async (req, res) => {
      try {
        const result = await reviewsColl.find().toArray();
        res.send(result);
      } catch (error) {
        // console.log(error);
        res.status(500).send('Failed to get all reviews');
      }
    });

    // Add coupons
    app.post('/add-coupon', async (req, res) => {
      try {
        const couponData = req.body.formData;
        const doc = {
          code: couponData.code,
          expiryDate: couponData.expiryDate,
          description: couponData.description,
          discount: couponData.discount,
        };
        const result = await couponColl.insertOne(doc);
        res.send(result);
      } catch (error) {
        // console.log(error);
        res.status(500).send('Error adding coupon');
      }
    });

    // Get all coupons
    app.get('/coupons', async (req, res) => {
      try {
        const result = await couponColl.find().toArray();
        res.send(result);
      } catch (error) {
        // console.log(error);
        res.status(500).send('Failed to get all coupons');
      }
    });

    // Delete coupon
    app.delete('/delete-coupon/:id', async (req, res) => {
      try {
        const id = req.params.id;
        const query = { _id: new ObjectId(id) };
        const result = await couponColl.deleteOne(query);
        res.send(result);
      } catch (error) {
        // console.log(error);
        res.status(500).send('Failed to delete coupon');
      }
    });

    // Get coupon by id
    app.get('/coupon/:id', async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await couponColl.findOne(query);
      res.send(result);
    });

    // Update Coupon data
    app.patch('/update-coupon/:id', async (req, res) => {
      try {
        const id = req.params.id;
        const coupon = req.body;
        const query = { _id: new ObjectId(id) };
        const updateDoc = {
          $set: {
            code: coupon.code,
            expiryDate: coupon.expiryDate,
            description: coupon.description,
            discount: coupon.discount,
          },
        };
        const result = await couponColl.updateOne(query, updateDoc);
        res.send(result);
      } catch (error) {}
    });
    ////////////////////////////////////////////////////////////
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}

run().catch(console.dir);

app.get('/', (req, res) => {
  res.send('ProdVent server is running!');
});

app.listen(port, () => {
  // console.log(`Example app listening on port ${port}`);
});
