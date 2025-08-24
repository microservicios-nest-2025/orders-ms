import { IsEnum, IsUUID } from "class-validator";
import { OrderStatus } from "generated/prisma";
import { OrderStatusList } from "../enum/order.enum";

export class ChangeOrderStatusDto {


    @IsUUID(4) 
    id: string;

    @IsEnum(OrderStatusList,{
        message: 'Status must be a valid order status'
    })
    status:OrderStatus
}