import type { Request, Response } from 'express';
import type { DeliveryRegisterInput } from '@gaby/shared';
import type { DeliveryUseCases } from '../../../application/use-cases/delivery/DeliveryUseCases.js';
import { authUser } from '../middleware/auth.js';

export class DeliveryController {
  constructor(private readonly deliveries: DeliveryUseCases) {}

  register = async (req: Request, res: Response): Promise<void> => {
    const data = await this.deliveries.register(
      req.params.orderId as string,
      req.params.reqId as string,
      req.body as DeliveryRegisterInput,
      authUser(req),
    );
    res.status(201).json({ data });
  };
}
