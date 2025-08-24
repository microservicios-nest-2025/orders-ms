import { HttpStatus, Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { CreateOrderDto } from './dto/create-order.dto';
import { PrismaClient } from 'generated/prisma';
import { ClientProxy, RpcException } from '@nestjs/microservices';
import { OrderPaginationDto } from './dto/order-pagination.dto';
import { ChangeOrderStatusDto } from './dto';
import { NATS_SERVICE } from 'src/config';
import { firstValueFrom } from 'rxjs';

@Injectable()
export class OrdersService extends PrismaClient implements OnModuleInit {

  private readonly logger = new Logger('OrderService')

  constructor(
    @Inject(NATS_SERVICE) private readonly client: ClientProxy
  ){
    super();
  }


  async onModuleInit() {
    await this.$connect();
    this.logger.log(`Database connected`)
  }
  
  async create(createOrderDto: CreateOrderDto) {
   
    try {
      // Validar que los productos existan
      const productIds = createOrderDto.items.map(item => item.productId);
      const products = await firstValueFrom(this.client.send({cmd:'validate_products'}, productIds));

      //Calcular totales
      const totalAmount = createOrderDto.items.reduce((acc, orderItem) => {
        const price = products.find(product => product.id === orderItem.productId).price;
        return price * orderItem.quantity;

      },0)

      const totalItems = createOrderDto.items.reduce((acc, orderItem) =>{
        return acc + orderItem.quantity;
      },0);

      //Crear transaccion de db
      const order = await this.order.create({
        data:{
          totalAmount,
          totalItems,
          orderItems:{
            createMany:{
              data: createOrderDto.items.map(orderItem => ({
                productId: orderItem.productId,
                quantity: orderItem.quantity,
                price: products.find(product => product.id === orderItem.productId).price
              }))
            }
          }
        },
        include:{
          orderItems: {
            select:{
              price: true,
              quantity: true,
              productId: true
            }
          }
        }
      })

      return {
        ...order,
        orderItems: order.orderItems.map(orderItem => {
          return {
            ...orderItem,
            name: products.find(product => product.id === orderItem.productId).name
          }
        })
      };
      
    } catch (error) {
      throw new RpcException({
        message: error.message,
        status: HttpStatus.BAD_REQUEST
      })
    }


  }

  async findAll(orderPaginationDto: OrderPaginationDto) {

    const totalPages =  await this.order.count({
      where: {
        status: orderPaginationDto.status
      }
    });

    const currentPage = orderPaginationDto.page || 1;
    const perPage = orderPaginationDto.limit || 10;

    return {
      data: await this.order.findMany({
        skip: (currentPage - 1) * perPage,
        take: perPage,
        where:{
          status: orderPaginationDto.status
        }
      }),
      meta:{
        total: totalPages,
        page: currentPage,
        lastPage: Math.ceil(totalPages / perPage),
      }
    }
  }

  async findOne(id: string) {

    const order = await this.order.findFirst({
      where:{
        id
      },
      include:{
        orderItems:{
          select:{
            price: true,
            quantity: true,
            productId: true
          }
        }
      }
    })

    if(!order) {
      throw new RpcException({
        message:`The order wiht #${id} not found`,
        status:HttpStatus.NOT_FOUND
      })
    }

    const productIds = order.orderItems.map(orderItem => orderItem.productId);
    const products = await firstValueFrom(this.client.send({cmd:'validate_products'}, productIds));

    return {
      ...order,
      orderItems: order.orderItems.map(orderItem => ({
        ...orderItem,
        name: products.find(product => product.id === orderItem.productId).name
      }))
    }
  }

  async changeStatus(changeOrderStatusDto: ChangeOrderStatusDto) {
    
    const {id, status} = changeOrderStatusDto;

    const order = await this.findOne(id);
    if(order.status === status){
      return order;
    }

    return this.order.update({
      where:{
        id
      },
      data:{
        status
      }
    })
  }

  
}
