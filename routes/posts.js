const express = require("express");
const router = express.Router();
const upload = require("../middleware/multer");
const postsController = require("../controllers/posts");
const { ensureAuth, ensureGuest } = require("../middleware/auth");

//Post Routes - simplified for now

//Since linked from server.js treat as path as:
//post/:id, post/createPost, post/likePost/:id, post/deletePost/:id
router.get("/:id", ensureAuth, postsController.getPost);

//enables user to create post w/ cloudinary for media uploads
router.post("/createPost", upload.single("file"), postsController.createPost);

//Enables user to like post. In controller, uses POST model to update likes by 1. 
router.put("/likePost/:id", postsController.likePost);

//Enables uesr to delete post. In controller uses POSt model to delete post from mongoDB collection.
router.delete("/deletePost/:id", ensureAuth, postsController.deletePost);

module.exports = router;
