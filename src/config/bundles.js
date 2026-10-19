const bundles = {
  mtn: [
    { id: "mtn-1gb", size: "1GB", validity: "3 months", priceGhs: 4.9 },
    { id: "mtn-2gb", size: "2GB", validity: "3 months", priceGhs: 9.7 },
    { id: "mtn-3gb", size: "3GB", validity: "3 months", priceGhs: 14.5 },
    { id: "mtn-4gb", size: "4GB", validity: "3 months", priceGhs: 19.5 },
    { id: "mtn-5gb", size: "5GB", validity: "3 months", priceGhs: 24.5 },
    { id: "mtn-6gb", size: "6GB", validity: "3 months", priceGhs: 28.5 },
    { id: "mtn-8gb", size: "8GB", validity: "3 months", priceGhs: 37 },
    { id: "mtn-10gb", size: "10GB", validity: "3 months", priceGhs: 44.5 },
    { id: "mtn-15gb", size: "15GB", validity: "3 months", priceGhs: 66.5 },
    { id: "mtn-20gb", size: "20GB", validity: "3 months", priceGhs: 85 },
    { id: "mtn-25gb", size: "25GB", validity: "3 months", priceGhs: 110 },
    { id: "mtn-30gb", size: "30GB", validity: "3 months", priceGhs: 128 },
    { id: "mtn-40gb", size: "40GB", validity: "3 months", priceGhs: 168 },
    { id: "mtn-50gb", size: "50GB", validity: "3 months", priceGhs: 220 }
  ],
  telecel: [
    { id: "tel-5gb", size: "5GB", validity: "3 months", priceGhs: 25 },
    { id: "tel-10gb", size: "10GB", validity: "3 months", priceGhs: 45 },
    { id: "tel-15gb", size: "15GB", validity: "3 months", priceGhs: 64 },
    { id: "tel-20gb", size: "20GB", validity: "3 months", priceGhs: 79 },
    { id: "tel-25gb", size: "25GB", validity: "3 months", priceGhs: 99 },
    { id: "tel-30gb", size: "30GB", validity: "3 months", priceGhs: 117 },
    { id: "tel-35gb", size: "35GB", validity: "3 months", priceGhs: 145 },
    { id: "tel-40gb", size: "40GB", validity: "3 months", priceGhs: 151 },
    { id: "tel-45gb", size: "45GB", validity: "3 months", priceGhs: 185 },
    { id: "tel-50gb", size: "50GB", validity: "3 months", priceGhs: 189 },
    { id: "tel-100gb", size: "100GB", validity: "3 months", priceGhs: 370 }
  ],
  airteltigo: [
    { id: "at-1gb", size: "1GB", validity: "3 months", priceGhs: 4.9 },
    { id: "at-2gb", size: "2GB", validity: "3 months", priceGhs: 9.7 },
    { id: "at-3gb", size: "3GB", validity: "3 months", priceGhs: 14.5 },
    { id: "at-4gb", size: "4GB", validity: "3 months", priceGhs: 19.5 },
    { id: "at-5gb", size: "5GB", validity: "3 months", priceGhs: 24.5 },
    { id: "at-6gb", size: "6GB", validity: "3 months", priceGhs: 28.5 },
    { id: "at-8gb", size: "8GB", validity: "3 months", priceGhs: 37 },
    { id: "at-10gb", size: "10GB", validity: "3 months", priceGhs: 44.5 },
    { id: "at-15gb", size: "15GB", validity: "3 months", priceGhs: 66.5 },
    { id: "at-20gb", size: "20GB", validity: "3 months", priceGhs: 85 },
    { id: "at-25gb", size: "25GB", validity: "3 months", priceGhs: 110 },
    { id: "at-30gb", size: "30GB", validity: "3 months", priceGhs: 128 },
    { id: "at-40gb", size: "40GB", validity: "3 months", priceGhs: 168 },
    { id: "at-50gb", size: "50GB", validity: "3 months", priceGhs: 220 }
  ]
};

for (const networkBundles of Object.values(bundles)) {
  for (const bundle of networkBundles) bundle.validity = "Unlimited";
}

module.exports = bundles;
