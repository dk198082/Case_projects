import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import productionPriorityRouter from "./production-priority";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(productionPriorityRouter);

export default router;
