import express from "express";
import { register, login } from "../controllers/auth.controller.js";
import { protect } from "../middleware/auth.middleware.js";


const router = express.Router();

router.post("/register", register);
router.post("/login", login);
router.get("/profile", protect, (req, res) => {

    res.json({
        success: true,
        message: "Protected Route",
    });
});

export default router;