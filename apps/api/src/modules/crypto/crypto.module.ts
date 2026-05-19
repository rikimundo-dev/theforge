import { Global, Module } from "@nestjs/common";
import { TokenCryptoService } from "./token-crypto.service.js";

@Global()
@Module({
  providers: [TokenCryptoService],
  exports: [TokenCryptoService],
})
export class CryptoModule {}
