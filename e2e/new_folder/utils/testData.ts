
export const loginData = {
url: 'https://staging-fc.cargowayz.net/login/AMAZERTRANS',
username: 'admin12@gmail.com',
branch: '19',
password: 'Digifc@2026'

}


export const customerData = {

customerName: 'Jeyaram Industries Pvt Ltd',

glCode: '13355',

city: 'Tirunelveli',

phone: '9876446546'
//enquiry Data 
}
export const enquiryData = {
  email: 'admin12@gmail.com',
  branch : '19',  
  password: 'Digifc@2026',

  source: 'Direct Call',
  blNo: 'BL12345',
  containerNo: 'CONT1234567',
  commodity: 'Cloth',

  pickupCity: 'Chennai',
  pickupAddress: 'Mumbai',
  deliveryCity: 'Bangalore',
  deliveryAddress: 'Bangalore',

  filePath1: 'assets/sample.png'
};
//vendor data
export const vendorData = {
    vendor: {
    name: 'RED supplier and service',
    glCode: '9865',
    address1: '107 BYO PASS',
    address2: '107',
    address3: 'NO NEED',
    state: 'Arunachal Pradesh',
    city: 'MDU',
    phone: '659653498',
    email: 'RED@GMAIL.COM',
    pan: 'OA87897987',
    iec: '8464984987',
    cin: 'SDF98984DF89898SDDF',
    salesPerson: 'REEMA',
    crtdate: '2026-02-01',
    crtEdate: '2026-02-28',
    kycExpiryDate: '2026-02-25'
  },
  contact: {
    firstName: 'HERXONE',
    designation: 'HEAD',
    phone: '2898794989',
    email: 'HERXq@GMAIL.COM'
  },
  bank: {
    name: 'IMO',
    accNo: '9765498',
    ifsc: 'IFSC7454565',
    branch: 'MUMBAI'
  },
  kyc: {
    gst: 'SDFS556868686846846',
    branch: 'MUMBAI',
    pincode: '979899'
  },
  filePath1: 'assets/sample.png'
};
//quote data
export const quoteData = {

  vendorName: 'Greens supplier and service',

  origin: {
    charge: 'BCF',
    quantity: '100',
    buyRate: '10',
    currency: 'INR'
  },

  international: {
    charge: 'BOF',
    quantity: '100',
    buyRate: '10',
    currency: 'INR'
  },

  destination: {
    charge: 'Clearance Charges',
    quantity: '100',
    buyRate: '10',
    currency: 'INR'
  },

  uploadFile: 'e2e/new_folder/assets/sample.png'
};
export const jobData = {
  referenceInvoice: '123'
}

// export const loginData = {
//   username: 'devtest@gmail.com',
//   password: 'Welcome@123',
//   company: '15'
// };

export const croData = {

  linerBookingNo: '123456',
  contractNo: '82208384111',
  consignee: 'consignee',

  // 🔥 MULTIPLE CONTAINERS
  containers: [
    {
      number: 'CON987654321',
      size: '20',
      type: 'GP',
      subEquip: '123',
      grossWeight: '1230',
      packQty: '20',
      volume: '2000'
    },
    {
      number: 'CON654321984',
      size: '20',
      type: 'FR',
      subEquip: '9865',
      grossWeight: '1500',
      packQty: '1200',
      volume: '1200'
    }
  ],

  // 🔥 MULTIPLE ROUTES
  routes: [
    {
      from: 'chennai',
      to: 'TVM',
      transhipment: 'Yes',
      mode: 'Export',
      vessel: 'Pearl black',
      voyage: '987654',
      etd: '2026-04-15',
      eta: '2026-04-29'
    },
    {
      from: 'TVM',
      to: 'Chennai',
      transhipment: 'Port SRH',
      mode: 'Import',
      vessel: 'Black Pearl',
      voyage: '6549',
      etd: '2026-04-15',
      eta: '2026-04-29'
    }
  ],

  document: {
    type: 'cro',
    file: 'Assets/2025-05-26_12-48.png'
  }
};
export const invoiceData = {
  copies: '2',
  shipperInvoice: 'INV98766',
  blNo: '98765499',
  consignee: {
    address1: 'tamilnad',
    address2: 'America',
    address3: 'India'
  }
};

export const charges = [
  { desc: 'BL Fee__51', uom: 'BL', qty: '20', rate: '200' },
];

export const vendorCharges = [
  { desc: 'BL Fee', vendor: 'Greens supplier and service', uom: 'BL', qty: '200', rate: '200' }
];

export const parties = [
  {
    company: 'Harthick PVT LMT',
    mobile: '9876549329',
    email: 'harthick@gmail.com'
  },
  {
    company: 'London Pvt Lmt',
    mobile: '6548247459',
    email: 'london@gmail.com'
  }
];