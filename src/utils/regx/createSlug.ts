const createSlug = (text : string) => {
    return text?.trim().toLowerCase().replace(/\s+/g, "-");
  };
  
  export default createSlug;
  