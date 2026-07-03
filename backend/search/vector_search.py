"""
Vector Search Module using ChromaDB
Enables semantic search of simulation results, models, and documentation
"""

from typing import List, Dict, Any, Optional
import chromadb
from chromadb.config import Settings
from chromadb.utils import embedding_functions
import os


class VectorSearch:
    """
    Vector search client for semantic similarity search
    """
    
    def __init__(
        self,
        collection_name: str = "simforge",
        persist_directory: str = "/tmp/simforge/chromadb",
        embedding_model: str = "all-MiniLM-L6-v2"
    ):
        """
        Initialize vector search client
        
        Args:
            collection_name: Name of the ChromaDB collection
            persist_directory: Directory to persist the database
            embedding_model: Name of the sentence-transformers model
        """
        self.persist_directory = persist_directory
        os.makedirs(persist_directory, exist_ok=True)
        
        # Initialize ChromaDB client
        self.client = chromadb.PersistentClient(
            path=persist_directory,
            settings=Settings(
                anonymized_telemetry=False,
                allow_reset=True
            )
        )
        
        # Initialize embedding function
        self.embedding_function = embedding_functions.SentenceTransformerEmbeddingFunction(
            model_name=embedding_model
        )
        
        # Get or create collection
        self.collection = self.client.get_or_create_collection(
            name=collection_name,
            embedding_function=self.embedding_function
        )
        
        self.collection_name = collection_name
    
    def add_document(
        self,
        document_id: str,
        text: str,
        metadata: Dict[str, Any],
        domain: Optional[str] = None
    ) -> None:
        """
        Add a document to the vector database
        
        Args:
            document_id: Unique identifier for the document
            text: Text content to embed
            metadata: Additional metadata (e.g., domain, parameters, results)
            domain: Optional domain tag
        """
        # Add domain to metadata if provided
        if domain:
            metadata['domain'] = domain
        
        self.collection.add(
            ids=[document_id],
            documents=[text],
            metadatas=[metadata]
        )
    
    def add_simulation_result(
        self,
        task_id: str,
        model: Dict[str, Any],
        result: Dict[str, Any],
        domain: str
    ) -> None:
        """
        Add a simulation result to the vector database
        
        Args:
            task_id: Unique task identifier
            model: Model parameters
            result: Simulation result
            domain: Simulation domain
        """
        # Create searchable text from model and result
        text_parts = []
        
        # Add domain and system type
        if 'SYSTEM_TYPE' in model:
            text_parts.append(f"System type: {model['SYSTEM_TYPE']}")
        text_parts.append(f"Domain: {domain}")
        
        # Add key parameters
        for section in ['COMPONENTS', 'INPUT', 'OUTPUT', 'GEOMETRY', 'MATERIAL']:
            if section in model:
                for key, value in model[section].items():
                    if isinstance(value, dict) and 'value' in value:
                        text_parts.append(f"{key}: {value['value']}")
                    else:
                        text_parts.append(f"{key}: {value}")
        
        # Add metrics
        if 'metrics' in result:
            for metric in result['metrics']:
                text_parts.append(f"{metric['name']}: {metric['value']}")
        
        # Add summary if available
        if 'plain_summary' in result:
            text_parts.append(result['plain_summary'])
        
        text = " ".join(text_parts)
        
        # Create metadata
        metadata = {
            'task_id': task_id,
            'domain': domain,
            'system_type': model.get('SYSTEM_TYPE', 'unknown'),
            'solver_name': result.get('solver_name', 'unknown'),
            'status': result.get('status', 'unknown')
        }
        
        # Add key metrics to metadata for filtering
        if 'metrics' in result:
            for metric in result['metrics']:
                if 'rawValue' in metric:
                    metadata[metric['name'].replace(' ', '_')] = metric['rawValue']
        
        self.add_document(
            document_id=task_id,
            text=text,
            metadata=metadata,
            domain=domain
        )
    
    def search(
        self,
        query: str,
        n_results: int = 10,
        domain: Optional[str] = None,
        filters: Optional[Dict[str, Any]] = None
    ) -> List[Dict[str, Any]]:
        """
        Search for similar documents
        
        Args:
            query: Search query text
            n_results: Number of results to return
            domain: Optional domain filter
            filters: Optional metadata filters
            
        Returns:
            List of search results with documents, metadata, and distances
        """
        # Build where clause for filtering
        where_clause = {}
        if domain:
            where_clause['domain'] = domain
        if filters:
            where_clause.update(filters)
        
        # Perform search
        results = self.collection.query(
            query_texts=[query],
            n_results=n_results,
            where=where_clause if where_clause else None
        )
        
        # Format results
        formatted_results = []
        if results['ids'] and results['ids'][0]:
            for i in range(len(results['ids'][0])):
                formatted_results.append({
                    'id': results['ids'][0][i],
                    'document': results['documents'][0][i],
                    'metadata': results['metadatas'][0][i],
                    'distance': results['distances'][0][i]
                })
        
        return formatted_results
    
    def search_similar_models(
        self,
        model: Dict[str, Any],
        domain: str,
        n_results: int = 5
    ) -> List[Dict[str, Any]]:
        """
        Find similar models based on parameters
        
        Args:
            model: Model to find similar models for
            domain: Domain to search in
            n_results: Number of results to return
            
        Returns:
            List of similar model results
        """
        # Create search text from model
        text_parts = []
        
        if 'SYSTEM_TYPE' in model:
            text_parts.append(f"System type: {model['SYSTEM_TYPE']}")
        
        for section in ['COMPONENTS', 'INPUT', 'OUTPUT', 'GEOMETRY', 'MATERIAL']:
            if section in model:
                for key, value in model[section].items():
                    if isinstance(value, dict) and 'value' in value:
                        text_parts.append(f"{key}: {value['value']}")
                    else:
                        text_parts.append(f"{key}: {value}")
        
        query = " ".join(text_parts)
        
        return self.search(
            query=query,
            n_results=n_results,
            domain=domain
        )
    
    def delete_document(self, document_id: str) -> None:
        """
        Delete a document from the vector database
        
        Args:
            document_id: ID of document to delete
        """
        self.collection.delete(ids=[document_id])
    
    def get_document(self, document_id: str) -> Optional[Dict[str, Any]]:
        """
        Retrieve a document by ID
        
        Args:
            document_id: ID of document to retrieve
            
        Returns:
            Document data or None if not found
        """
        results = self.collection.get(ids=[document_id])
        
        if results['ids'] and results['ids'][0]:
            return {
                'id': results['ids'][0],
                'document': results['documents'][0],
                'metadata': results['metadatas'][0]
            }
        
        return None
    
    def clear_collection(self) -> None:
        """Clear all documents from the collection"""
        # Delete and recreate collection
        self.client.delete_collection(self.collection_name)
        self.collection = self.client.create_collection(
            name=self.collection_name,
            embedding_function=self.embedding_function
        )
    
    def get_collection_stats(self) -> Dict[str, Any]:
        """
        Get statistics about the collection
        
        Returns:
            Dictionary with collection statistics
        """
        count = self.collection.count()
        
        # Get sample of metadata to analyze domains
        sample = self.collection.get(limit=100, include=['metadatas'])
        
        domains = set()
        if sample['metadatas']:
            for meta in sample['metadatas']:
                if 'domain' in meta:
                    domains.add(meta['domain'])
        
        return {
            'collection_name': self.collection_name,
            'total_documents': count,
            'domains': list(domains),
            'persist_directory': self.persist_directory
        }


def create_vector_search_client(
    collection_name: str = "simforge",
    persist_directory: str = "/tmp/simforge/chromadb"
) -> VectorSearch:
    """
    Factory function to create a vector search client
    
    Args:
        collection_name: Name of the ChromaDB collection
        persist_directory: Directory to persist the database
        
    Returns:
        VectorSearch instance
    """
    return VectorSearch(
        collection_name=collection_name,
        persist_directory=persist_directory
    )
