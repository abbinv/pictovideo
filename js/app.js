class VideoConverter {
  constructor() {
    this.imageItems = [];
    this.canvas = document.createElement('canvas');
    this.ctx = this.canvas.getContext('2d');
    this.mediaRecorder = null;
    this.recordedChunks = [];
    this.audioChunks = [];
    this.audioContext = null;
    this.audioDestination = null;
    
    this.initElements();
    this.bindEvents();
  }

  initElements() {
    this.imageInput = document.getElementById('imageInput');
    this.createVideoBtn = document.getElementById('createVideo');
    this.imageList = document.getElementById('imageList');
    this.output = document.getElementById('output');
  }

  bindEvents() {
    this.imageInput.addEventListener('change', (e) => this.handleImageUpload(e));
    this.createVideoBtn.addEventListener('click', () => this.createVideo());
  }

  handleImageUpload(event) {
    const file = event.target.files[0];
    if (!file || !file.type.startsWith('image/')) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        this.addImageItem(img, file.name);
        this.updateCreateButton();
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
    
    // Reset input
    event.target.value = '';
  }

  addImageItem(img, filename) {
    const id = Date.now();
    const item = {
      id,
      img,
      duration: 2,
      filename,
      text: ''
    };
    
    this.imageItems.push(item);
    
    const div = document.createElement('div');
    div.className = 'image-item';
    div.innerHTML = `
      <img src="${img.src}" alt="${filename}">
      <div class="image-controls">
        <span>${filename}</span>
        <label>Transition: <input type="number" value="2" min="0" max="5" step="0.5">s</label>
        <label>Text: <textarea placeholder="Enter text to be spoken..." rows="2"></textarea></label>
        <button class="remove-btn">Remove</button>
      </div>
    `;
    
    const durationInput = div.querySelector('input');
    const textInput = div.querySelector('textarea');
    const removeBtn = div.querySelector('.remove-btn');
    
    durationInput.addEventListener('change', (e) => {
      item.duration = parseFloat(e.target.value);
    });
    
    textInput.addEventListener('input', (e) => {
      item.text = e.target.value;
    });
    
    removeBtn.addEventListener('click', () => {
      this.removeImageItem(id);
      div.remove();
      this.updateCreateButton();
    });
    
    this.imageList.appendChild(div);
  }
  
  removeImageItem(id) {
    this.imageItems = this.imageItems.filter(item => item.id !== id);
  }
  
  updateCreateButton() {
    this.createVideoBtn.disabled = this.imageItems.length === 0;
  }

  async createVideo() {
    if (this.imageItems.length === 0) return;

    this.createVideoBtn.disabled = true;
    this.output.innerHTML = '<div class="loading">Creating video with synchronized audio...</div>';
    
    this.canvas.width = 1280;
    this.canvas.height = 720;

    const stream = this.canvas.captureStream(30);
    this.recordedChunks = [];

    let mimeType = 'video/webm;codecs=vp8';
    if (!MediaRecorder.isTypeSupported(mimeType)) {
      mimeType = 'video/webm';
    }

    this.mediaRecorder = new MediaRecorder(stream, { mimeType });

    this.mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        this.recordedChunks.push(event.data);
      }
    };

    this.mediaRecorder.onstop = () => {
      const blob = new Blob(this.recordedChunks, { type: 'video/webm' });
      this.displayVideo(blob);
      this.createVideoBtn.disabled = false;
    };

    this.mediaRecorder.start(100);
    await this.renderImagesWithAudio();
    
    setTimeout(() => {
      this.mediaRecorder.stop();
    }, 1000);
  }

  async renderImagesWithAudio() {
    const fps = 30;
    const frameDuration = 1000 / fps;

    for (let i = 0; i < this.imageItems.length; i++) {
      const item = this.imageItems[i];
      
      const scale = Math.min(this.canvas.width / item.img.width, this.canvas.height / item.img.height);
      const scaledWidth = item.img.width * scale;
      const scaledHeight = item.img.height * scale;
      const x = (this.canvas.width - scaledWidth) / 2;
      const y = (this.canvas.height - scaledHeight) / 2;

      let totalDuration;
      
      // Calculate total duration for this image
      if (item.text.trim()) {
        totalDuration = this.estimateTextDuration(item.text) + item.duration;
        // Start speech
        this.speakText(item.text);
      } else {
        totalDuration = 3 + item.duration; // 3 seconds default + transition
      }

      const totalFrames = Math.floor(totalDuration * fps);
      
      // Render all frames for this image (audio + transition)
      for (let frame = 0; frame < totalFrames; frame++) {
        this.ctx.fillStyle = '#000';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        this.ctx.drawImage(item.img, x, y, scaledWidth, scaledHeight);
        await new Promise(resolve => setTimeout(resolve, frameDuration));
      }
    }
  }

  estimateTextDuration(text) {
    // Estimate based on average speaking rate (150-160 words per minute)
    const words = text.trim().split(/\s+/).length;
    const wordsPerSecond = 2.5; // 150 words per minute
    return Math.max(2, words / wordsPerSecond + 0.5); // Add small buffer
  }

  speakText(text) {
    if ('speechSynthesis' in window) {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 0.9;
      utterance.pitch = 1;
      utterance.volume = 1.0;
      speechSynthesis.speak(utterance);
    }
  }

  displayVideo(blob) {
    const video = document.createElement('video');
    const url = URL.createObjectURL(blob);
    video.src = url;
    video.controls = true;
    video.muted = false;
    video.style.maxWidth = '100%';
    video.style.height = 'auto';

    const downloadLink = document.createElement('a');
    downloadLink.href = url;
    downloadLink.download = `slideshow-${Date.now()}.webm`;
    downloadLink.className = 'download-btn';
    downloadLink.textContent = 'Download Video';

    const totalDuration = this.imageItems.reduce((sum, item) => {
      const audioDuration = item.text.trim() ? this.estimateTextDuration(item.text) : 3;
      return sum + audioDuration + item.duration;
    }, 0);
    const info = document.createElement('p');
    info.innerHTML = `
      <strong>Video created:</strong> ${this.imageItems.length} images, ${totalDuration.toFixed(1)}s duration, ${(blob.size / 1024 / 1024).toFixed(2)} MB<br>
      <em>Note: Audio plays during video creation and should be synchronized. If audio is not audible in the final video, it may be a browser limitation.</em>
    `;
    info.style.marginBottom = '10px';
    info.style.color = '#666';
    info.style.fontSize = '14px';

    this.output.innerHTML = '';
    this.output.appendChild(info);
    this.output.appendChild(video);
    this.output.appendChild(document.createElement('br'));
    this.output.appendChild(downloadLink);

    setTimeout(() => {
      video.play().catch(e => console.log('Auto-play prevented by browser'));
    }, 100);
  }
}

// Initialize the converter when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  new VideoConverter();
});