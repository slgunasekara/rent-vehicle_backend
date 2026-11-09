/**
 * Every district of Sri Lanka with its main cities / towns.
 * The SAME file lives in frontend/src/data/locations.ts - keep the two identical.
 * A listing stores a `district` and a `city` (a city of that district).
 */
export interface DistrictInfo { district: string; province: string; cities: string[] }

const raw: [string, string, string][] = [
  ['Colombo', 'Western', 'Colombo,Dehiwala-Mount Lavinia,Moratuwa,Sri Jayawardenepura Kotte,Kotte,Battaramulla,Maharagama,Kotikawatta,Kolonnawa,Kesbewa,Homagama,Mulleriyawa,Piliyandala,Nugegoda,Rajagiriya,Nawala,Boralesgamuwa,Kohuwala,Pannipitiya,Padukka,Avissawella,Hanwella,Kaduwela,Malabe,Athurugiriya,Ratmalana,Wellawatte,Bambalapitiya,Kollupitiya,Narahenpita,Borella,Dematagoda,Maradana,Pettah,Mattakkuliya,Modara,Kirulapone,Thalawathugoda,Hokandara,Kottawa,Meegoda,Godagama,Angulana,Katubedda,Mount Lavinia'],
  ['Gampaha', 'Western', 'Gampaha,Negombo,Katunayake,Seeduwa,Ja-Ela,Ragama,Kadawatha,Kiribathgoda,Kelaniya,Wattala,Peliyagoda,Minuwangoda,Divulapitiya,Nittambuwa,Veyangoda,Mirigama,Attanagalla,Ganemulla,Yakkala,Biyagama,Dompe,Weliweriya,Kandana,Ekala,Delgoda,Raddolugama,Mahara,Pamunugama,Welisara,Kirindiwela,Pasyala,Thimbirigasyaya,Udugampola,Henegama'],
  ['Kalutara', 'Western', 'Kalutara,Panadura,Horana,Beruwala,Aluthgama,Bandaragama,Matugama,Wadduwa,Ingiriya,Bulathsinhala,Agalawatta,Payagala,Dodangoda,Millaniya,Palindanuwara,Bombuwala,Welipenna,Maggona,Katukurunda,Moragahahena,Mathugama'],
  ['Kandy', 'Central', 'Kandy,Peradeniya,Katugastota,Gampola,Nawalapitiya,Pilimatalawa,Kadugannawa,Akurana,Digana,Teldeniya,Wattegama,Kundasale,Galagedara,Pussellawa,Ampitiya,Hataraliyadda,Menikhinna,Madawala Bazaar,Talatuoya,Peradeniya Junction,Thennekumbura,Haragama,Mawilmada,Galaha,Udispattuwa,Medamahanuwara'],
  ['Matale', 'Central', 'Matale,Dambulla,Sigiriya,Galewela,Ukuwela,Rattota,Pallepola,Naula,Yatawatta,Laggala,Wilgamuwa,Palapathwela,Inamaluwa,Kandalama,Madawala Ulpotha'],
  ['Nuwara Eliya', 'Central', 'Nuwara Eliya,Hatton,Talawakele,Nanu Oya,Ginigathhena,Kotagala,Maskeliya,Bogawantalawa,Norwood,Lindula,Hanguranketha,Walapane,Ramboda,Kothmale,Agarapathana,Dickoya,Pundaluoya,Nildandahinna,Rikillagaskada,Kandapola,Pattipola'],
  ['Galle', 'Southern', 'Galle,Hikkaduwa,Ambalangoda,Elpitiya,Baddegama,Bentota,Karapitiya,Unawatuna,Habaraduwa,Ahangama,Imaduwa,Neluwa,Yakkalamulla,Karandeniya,Balapitiya,Wakwella,Udugama,Nagoda,Pitigala,Thawalama,Akmeemana,Kosgoda,Boossa,Batapola,Dodanduwa,Rathgama,Uragasmanhandiya'],
  ['Matara', 'Southern', 'Matara,Weligama,Mirissa,Akuressa,Dikwella,Devinuwara,Kamburupitiya,Hakmana,Kotapola,Thihagoda,Deniyaya,Pitabeddara,Malimbada,Kekanadura,Gandara,Welipitiya,Dondra,Kirinda Puhulwella,Athuraliya,Morawaka,Kamburugamuwa'],
  ['Hambantota', 'Southern', 'Hambantota,Tangalle,Tissamaharama,Ambalantota,Beliatta,Weeraketiya,Sooriyawewa,Lunugamvehera,Walasmulla,Angunakolapelessa,Katuwana,Okewela,Kirinda,Debarawewa,Middeniya,Ranna,Mattala'],
  ['Jaffna', 'Northern', 'Jaffna,Nallur,Chavakachcheri,Point Pedro,Karainagar,Kopay,Tellippalai,Manipay,Chunnakam,Velvettithurai,Kankesanthurai,Sandilipay,Uduvil,Kaithady,Atchuveli,Nelliady,Kodikamam,Maruthankerny,Pungudutivu,Delft'],
  ['Kilinochchi', 'Northern', 'Kilinochchi,Paranthan,Pallai,Elephant Pass,Poonakary,Mulankavil,Akkarayan,Tharmapuram'],
  ['Mannar', 'Northern', 'Mannar,Nanattan,Madhu,Pesalai,Murunkan,Thalaimannar,Adampan,Vidataltivu'],
  ['Vavuniya', 'Northern', 'Vavuniya,Cheddikulam,Omanthai,Nedunkeni,Settikulam,Puliyankulam,Pampaimadu,Kanagarayankulam'],
  ['Mullaitivu', 'Northern', 'Mullaitivu,Puthukkudiyiruppu,Oddusuddan,Mankulam,Thunukkai,Weli Oya,Kokkilai,Mulliyawalai'],
  ['Batticaloa', 'Eastern', 'Batticaloa,Kattankudy,Eravur,Valaichchenai,Kalkudah,Chenkalady,Kaluwanchikudy,Oddamavadi,Vakarai,Kokkadicholai,Kiran,Kaluthavalai'],
  ['Ampara', 'Eastern', 'Ampara,Kalmunai,Akkaraipattu,Sainthamaruthu,Pottuvil,Sammanthurai,Uhana,Dehiattakandiya,Mahaoya,Damana,Lahugala,Arugam Bay,Nintavur,Addalaichenai,Karaitivu,Thirukkovil,Navithanveli,Padiyathalawa'],
  ['Trincomalee', 'Eastern', 'Trincomalee,Kinniya,Mutur,Kuchchaveli,Nilaveli,Kantale,Seruwila,Gomarankadawala,Morawewa,Thambalagamuwa,Uppuveli,Pulmoddai'],
  ['Kurunegala', 'North Western', 'Kurunegala,Kuliyapitiya,Narammala,Wariyapola,Pannala,Melsiripura,Nikaweratiya,Mawathagama,Polgahawela,Alawwa,Ibbagamuwa,Galgamuwa,Giriulla,Hettipola,Maho,Bingiriya,Rideegama,Ganewatta,Kobeigane,Polpithigama,Dodangaslanda,Wellawa,Pothuhera,Bamunakotuwa,Kumbukgete,Mallawapitiya,Alawwa'],
  ['Puttalam', 'North Western', 'Puttalam,Chilaw,Wennappuwa,Marawila,Nattandiya,Dankotuwa,Kalpitiya,Anamaduwa,Mundel,Madampe,Mahawewa,Nainamadama,Pallama,Arachchikattuwa,Karuwalagaswewa,Lunuwila,Udappuwa,Mahawewa,Kakkapalliya'],
  ['Anuradhapura', 'North Central', 'Anuradhapura,Kekirawa,Thambuttegama,Mihintale,Medawachchiya,Eppawala,Galenbindunuwewa,Nochchiyagama,Padaviya,Kahatagasdigiliya,Rambewa,Thirappane,Horowpothana,Galnewa,Palagala,Habarana,Talawa,Maradankadawala,Tirappane'],
  ['Polonnaruwa', 'North Central', 'Polonnaruwa,Kaduruwela,Hingurakgoda,Medirigiriya,Dimbulagala,Welikanda,Bakamuna,Lankapura,Elahera,Minneriya,Aralaganwila,Giritale,Jayanthipura'],
  ['Badulla', 'Uva', 'Badulla,Bandarawela,Haputale,Ella,Welimada,Mahiyanganaya,Passara,Diyatalawa,Hali-Ela,Lunugala,Soranathota,Kandaketiya,Meegahakiula,Rideemaliyadda,Uva Paranagama,Demodara,Haldummulla,Bogahakumbura,Beragala,Spring Valley,Koslanda'],
  ['Monaragala', 'Uva', 'Monaragala,Wellawaya,Bibile,Buttala,Kataragama,Medagama,Siyambalanduwa,Madulla,Thanamalwila,Badalkumbura,Sevanagala,Okkampitiya,Ethimale,Kumbukkana'],
  ['Ratnapura', 'Sabaragamuwa', 'Ratnapura,Embilipitiya,Balangoda,Pelmadulla,Kuruwita,Eheliyagoda,Rakwana,Kahawatta,Kalawana,Nivithigala,Godakawela,Opanayake,Ayagama,Weligepola,Imbulpe,Kolonna,Pallebedda,Elapatha,Kiriella,Wewelwatta,Suriyakanda'],
  ['Kegalle', 'Sabaragamuwa', 'Kegalle,Mawanella,Warakapola,Rambukkana,Ruwanwella,Galigamuwa,Deraniyagala,Yatiyanthota,Dehiowita,Aranayaka,Bulathkohupitiya,Kotiyakumbura,Hemmathagama,Galapitamada'],
];

export const DISTRICTS: DistrictInfo[] = raw.map(([district, province, list]) => ({
  district,
  province,
  cities: Array.from(new Set(list.split(',').map((s) => s.trim()).filter(Boolean))),
}));

export const PROVINCES = Array.from(new Set(DISTRICTS.map((d) => d.province)));
export const districtNames = DISTRICTS.map((d) => d.district);

/** the district a city belongs to (first match) - used when somebody types a city name only */
export const districtOf = (city: string): string | undefined => DISTRICTS.find((d) => d.cities.some((c) => c.toLowerCase() === city.trim().toLowerCase()))?.district;

/** true when `city` is a real city of `district` */
export const isValidLocation = (district: string, city: string): boolean => {
  const d = DISTRICTS.find((x) => x.district === district);
  return !!d && d.cities.some((c) => c === city);
};

/** the exact spelling used in the list ("kandy" -> "Kandy") */
export const canonicalCity = (district: string, city: string): string | undefined => DISTRICTS.find((x) => x.district === district)?.cities.find((c) => c.toLowerCase() === city.trim().toLowerCase());
