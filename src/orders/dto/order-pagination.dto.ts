import { IsEnum, IsOptional } from "class-validator";
import { PaginationDto } from "src/common";
import { OrderStatusList } from "../enum/order.enum";
import { OrderStatus } from "generated/prisma";


export class OrderPaginationDto extends PaginationDto {
    
    @IsOptional()
    @IsEnum(OrderStatusList,{
        message: `Valid statuses are: ${OrderStatusList}`
    })
    status?: OrderStatus;
    
}    