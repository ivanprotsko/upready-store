import { AbstractFulfillmentProviderService } from "@medusajs/framework/utils";
import type {
  CalculatedShippingOptionPrice,
  CalculateShippingOptionPriceContext,
  CreateFulfillmentResult,
  CreateShippingOptionDTO,
  FulfillmentOption,
} from "@medusajs/framework/types";
import { isTenantMethodData, quoteTariff, type QuoteItem } from "../../shipping-tariffs/tariff";
import { zoneLabelFor } from "../../shipping-tariffs/ru-zone-presets";

/**
 * Fulfillment provider for a tenant's own delivery methods. Like the manual
 * provider it hands nothing to any carrier (the owner ships by hand and types
 * the tracking number in the panel); unlike it, it prices a `calculated`
 * option from the tariff the option's `data` carries and the cart Medusa
 * passes in `context` (items with variant weights, currency, locale).
 *
 * Registered in medusa-config.ts as provider `tariff`, so its id is
 * `tariff_tariff`, and linked to each tenant warehouse by the shipping-method
 * workflow the first time the tenant creates a method.
 */
class TariffFulfillmentService extends AbstractFulfillmentProviderService {
  static identifier = "tariff";

  async getFulfillmentOptions(): Promise<FulfillmentOption[]> {
    return [{ id: "tariff" }];
  }

  /**
   * What the cart's (and then the order's) shipping method keeps in `data`.
   * Medusa stores whatever this returns, and the client sends nothing, so
   * without this the order records only a method NAME: the owner packing the
   * parcel would have to read the zone out of that name. The zone and the
   * carrier are copied in from the option (b03-shipping-zones-weight).
   */
  async validateFulfillmentData(
    optionData: Record<string, unknown>,
    data: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    if (!isTenantMethodData(optionData)) {
      return data;
    }
    return {
      ...data,
      zone_label: optionData.zone?.label || zoneLabelFor(optionData.zone ?? null),
      carrier: optionData.carrier ?? null,
      tariff_kind: optionData.tariff.kind,
    };
  }

  async validateOption(_data: Record<string, unknown>): Promise<boolean> {
    return true;
  }

  async canCalculate(data: CreateShippingOptionDTO): Promise<boolean> {
    return isTenantMethodData(data.data);
  }

  async calculatePrice(
    optionData: Record<string, unknown>,
    _data: Record<string, unknown>,
    context: CalculateShippingOptionPriceContext,
  ): Promise<CalculatedShippingOptionPrice> {
    if (!isTenantMethodData(optionData)) {
      throw new Error("Shipping option data is not a tenant shipping method");
    }
    const cart = context as unknown as {
      currency_code: string;
      locale?: string | null;
      items?: Array<{
        quantity: number;
        unit_price: number;
        variant?: { weight?: number | null } | null;
        product?: { weight?: number | null } | null;
      }>;
    };
    const items: QuoteItem[] = (cart.items ?? []).map((item) => ({
      quantity: Number(item.quantity),
      unit_price: Number(item.unit_price),
      weight: item.variant?.weight ?? null,
      product_weight: item.product?.weight ?? null,
    }));
    const quote = quoteTariff(optionData.tariff, {
      items,
      currency_code: cart.currency_code,
      locale: cart.locale ?? null,
      default_weight_g: optionData.default_weight_g,
    });
    return {
      calculated_amount: quote.amount,
      is_calculated_price_tax_inclusive: false,
    };
  }

  async createFulfillment(): Promise<CreateFulfillmentResult> {
    // Nothing leaves the backend: the owner hands the parcel over herself.
    return { data: {}, labels: [] };
  }

  async cancelFulfillment(): Promise<Record<string, unknown>> {
    return {};
  }

  async createReturnFulfillment(): Promise<CreateFulfillmentResult> {
    return { data: {}, labels: [] };
  }
}

export default TariffFulfillmentService;
