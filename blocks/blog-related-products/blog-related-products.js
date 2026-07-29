import { getHeaders, getConfigValue } from '@dropins/tools/lib/aem/configs.js';
import { createOptimizedPicture, getMetadata, readBlockConfig } from '../../scripts/aem.js';
import { getProductLink } from '../../scripts/commerce.js';

const PRODUCTS_QUERY = `
  query BlogRelatedProducts($skus: [String!]) {
    products(filter: { sku: { in: $skus } }) {
      items {
        sku
        name
        url_key
        small_image {
          url
          label
        }
        price_range {
          minimum_price {
            final_price {
              value
              currency
            }
          }
        }
      }
    }
  }
`;

function parseSkus(value) {
  if (!value) return [];
  return String(value)
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function getCurrencyFormatter(currency) {
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency });
  } catch {
    return new Intl.NumberFormat(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
}

async function fetchProductsBySkus(skus) {
  if (!skus.length) return [];

  const endpoint = getConfigValue('commerce-core-endpoint') || await getConfigValue('commerce-endpoint');
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...getHeaders('all'),
    },
    body: JSON.stringify({
      query: PRODUCTS_QUERY,
      variables: { skus },
    }),
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch products (${response.status})`);
  }

  const json = await response.json();
  return json?.data?.products?.items || [];
}

function createProductCard(product) {
  const card = document.createElement('article');
  card.className = 'blog-related-products__item';

  const link = document.createElement('a');
  link.className = 'blog-related-products__link';
  link.href = getProductLink(product.url_key, product.sku);

  if (product.small_image?.url) {
    const picture = createOptimizedPicture(
      product.small_image.url,
      product.small_image.label || product.name,
      false,
      [{ width: '400' }],
    );
    picture.classList.add('blog-related-products__image');
    link.append(picture);
  }

  const body = document.createElement('div');
  body.className = 'blog-related-products__body';

  const title = document.createElement('h3');
  title.className = 'blog-related-products__name';
  title.textContent = product.name;
  body.append(title);

  const priceValue = product.price_range?.minimum_price?.final_price?.value;
  const priceCurrency = product.price_range?.minimum_price?.final_price?.currency;
  if (typeof priceValue === 'number' && priceCurrency) {
    const price = document.createElement('p');
    price.className = 'blog-related-products__price';
    price.textContent = getCurrencyFormatter(priceCurrency).format(priceValue);
    body.append(price);
  }

  link.append(body);
  card.append(link);
  return card;
}

function renderEmpty(block) {
  const message = document.createElement('p');
  message.className = 'blog-related-products__empty';
  message.textContent = 'Add product SKUs to show related products.';
  block.replaceChildren(message);
}

export default async function decorate(block) {
  const config = readBlockConfig(block);
  const metadataSkus = getMetadata('related-skus');
  const skus = parseSkus(config.skus || metadataSkus);
  const limit = Number.parseInt(config.limit, 10) || 4;
  const titleText = config.title || 'Related Products';

  if (!skus.length) {
    renderEmpty(block);
    return;
  }

  const section = document.createElement('section');
  section.className = 'blog-related-products';
  const title = document.createElement('h2');
  title.className = 'blog-related-products__title';
  title.textContent = titleText;

  const list = document.createElement('div');
  list.className = 'blog-related-products__list';

  try {
    const products = await fetchProductsBySkus(skus);
    const sorted = skus
      .map((sku) => products.find((product) => product.sku === sku))
      .filter(Boolean)
      .slice(0, limit);

    if (!sorted.length) {
      renderEmpty(block);
      return;
    }

    sorted.forEach((product) => list.append(createProductCard(product)));
  } catch (error) {
    console.error('Failed to load related products', error);
    renderEmpty(block);
    return;
  }

  section.append(title, list);
  block.replaceChildren(section);
}
