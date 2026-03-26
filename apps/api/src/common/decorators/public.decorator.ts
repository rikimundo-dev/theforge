import { SetMetadata } from "@nestjs/common";

export const IS_PUBLIC_KEY = "isPublic";

/** Marca ruta o controlador como accesible sin JWT (healthcheck, login). */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
