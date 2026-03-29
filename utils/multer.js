const multer=require('multer');
const path=require('path');
const fs= require('fs');


const filterFile=(req,file,cb)=>{

    const allowedTypes =["image/jpeg","image/png", "image/jpg"];

    if(allowedTypes.includes(file.mimetype)){
        cb(null,true);
    }else{

        cb(new Error("Invalid file type . Only image file are allowed!"),false)
    }
}

const createStorage= (folderName)=>{

    return multer.diskStorage({
        destination:(req,file,cb)=>{
            const uploadPath = path.join(__dirname,`../public/uploads/${folderName}`);
            if(!fs.existsSync(uploadPath)){
                fs.mkdirSync(uploadPath, { recursive: true });

        }
         cb(null, uploadPath);
         },

         filename:(req,file,cb)=>{
            const uniqueName=Date.now()+"-"+ Math.round(Math.random() * 1e9);
            cb(null,file.fieldname+"-"+uniqueName+path.extname(file.originalname));
         }

    });

}

const uploadProduct = multer({
    storage:createStorage("productsImages"),
    limits:{fileSize:10*1024*1024,files:5 },
    fileFilter:filterFile

})

const uploadProfile = multer({
  storage: createStorage("profileImages"),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB per file
  fileFilter: filterFile
})

module.exports= {uploadProduct,uploadProfile};