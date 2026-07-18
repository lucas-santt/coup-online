export default class ImageLoader {
    static imageLoadPromise(imagePath) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            
            img.onload  = () => resolve(img);
            img.onerror = () => reject(new Error(`Error when loading ${imagePath}`));
            img.src = imagePath;
        });
    }

    static loadImages(imagePaths) {
        const promises = imagePaths.map(imagePath => this.imageLoadPromise(imagePath));

        return Promise.all(promises);
    }
}